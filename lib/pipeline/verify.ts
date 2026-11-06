import { z } from "zod";
import { chatJson, createRunStats } from "@/lib/llm";
import type { Candidate, RunStats } from "@/types";
import {
  FactSchema,
  SourceSchema,
  type Fact,
  type Source,
} from "@/types";
import {
  getDateWindow,
  getTwelveMonthCutoff,
  isBlocklistedDomain,
  isWithinDateRange,
  matchesDomain,
} from "@/lib/source-quality";
import {
  SynthesisBriefSchema,
  type SynthesisBrief,
} from "@/lib/pipeline/synthesize";

const VerificationStatusSchema = z.enum([
  "supported",
  "unsupported",
  "partial",
]);

const SentenceCheckSchema = z.object({
  id: z.string().min(1),
  verdict: VerificationStatusSchema,
  reason: z.string().trim().min(1),
});

const VerificationResponseSchema = z.object({
  checks: z.array(SentenceCheckSchema),
});

function normalizeVerificationResponse(value: unknown): unknown {
  if (Array.isArray(value)) return { checks: value };
  if (typeof value !== "object" || value === null) return value;

  const response = value as Record<string, unknown>;
  if (Array.isArray(response.checks)) return response;
  for (const key of ["results", "verdicts", "claims"]) {
    if (Array.isArray(response[key])) {
      return { ...response, checks: response[key] };
    }
  }
  return value;
}

function isVerificationValidationError(error: unknown): boolean {
  return (
    error instanceof z.ZodError ||
    (error instanceof Error &&
      /model response (?:failed schema validation|is not valid JSON)|model returned an empty response/i.test(
        error.message,
      ))
  );
}

const CleanedSentenceSchema = z.object({
  text: z.string().trim().min(1),
  factIds: z.array(z.string().min(1)).min(1),
  verificationStatus: z.literal("partial").optional(),
  backgroundDate: z.string().optional(),
});

const CleanedTimelineEntrySchema = CleanedSentenceSchema.extend({
  date: z.string().trim().min(1),
});

export const CleanedBriefSchema = z.object({
  summary: z.array(CleanedSentenceSchema),
  timeline: z.array(CleanedTimelineEntrySchema),
  recentInvestments: z.array(CleanedSentenceSchema),
  thesisDrift: z.array(CleanedSentenceSchema),
  portfolioConflicts: z.array(CleanedSentenceSchema),
  conversationStarters: z.array(CleanedSentenceSchema),
});

export type CleanedBrief = z.infer<typeof CleanedBriefSchema>;

type SentenceLocation = {
  section: keyof SynthesisBrief;
  index: number;
  sentenceIndex: number;
  sentence: string;
  factIds: string[];
  date?: string;
};

const rollingYearClaimPattern =
  /\b(?:last|past|previous)\s+(?:12|twelve)\s+months?\b|\b(?:last|past)\s+year\b/i;
const currentYearClaimPattern =
  /\b(?:this|current)\s+(?:(?:calendar|fiscal)\s+)?year\b|\byear[- ]to[- ]date\b|\bYTD\b/i;

function isBackgroundSource(
  source: Source,
  startDate: string,
  officialDomain: string,
): boolean {
  return (
    source.background ||
    (source.publishedAt !== null &&
      source.publishedAt < startDate &&
      matchesDomain(source.domain, officialDomain))
  );
}

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function collectSentences(brief: SynthesisBrief): SentenceLocation[] {
  const locations: SentenceLocation[] = [];

  const addEntries = (
    section: keyof SynthesisBrief,
    entries: Array<{ text: string; factIds: string[]; date?: string }>,
  ) => {
    entries.forEach((entry, index) => {
      splitSentences(entry.text).forEach((sentence, sentenceIndex) => {
        locations.push({
          section,
          index,
          sentenceIndex,
          sentence,
          factIds: entry.factIds,
          ...(entry.date ? { date: entry.date } : {}),
        });
      });
    });
  };

  addEntries("summary", brief.summary);
  addEntries("timeline", brief.timeline);
  addEntries("recentInvestments", brief.recentInvestments);
  addEntries("thesisDrift", brief.thesisDrift);
  addEntries("portfolioConflicts", brief.portfolioConflicts);
  addEntries("conversationStarters", brief.conversationStarters);
  return locations;
}

function hasExpectedCheckIds(
  checks: z.infer<typeof SentenceCheckSchema>[],
  expectedIds: string[],
): boolean {
  const receivedIds = checks.map(({ id }) => id);
  return (
    receivedIds.length === expectedIds.length &&
    new Set(receivedIds).size === expectedIds.length &&
    expectedIds.every((id) => receivedIds.includes(id))
  );
}

export async function verifyBrief(
  brief: SynthesisBrief,
  facts: Fact[],
  sources: Source[],
  candidate: Pick<Candidate, "officialDomain">,
  meetingAt: string,
  stats: RunStats = createRunStats(),
): Promise<CleanedBrief> {
  const validatedBrief = SynthesisBriefSchema.parse(brief);
  const validatedFacts = z.array(FactSchema).parse(facts);
  const validatedSources = z.array(SourceSchema).parse(sources);
  const factById = new Map(validatedFacts.map((fact) => [fact.id, fact]));
  const sourceById = new Map(validatedSources.map((source) => [source.id, source]));
  const { startDate, endDate } = getDateWindow(meetingAt);
  const twelveMonthCutoff = getTwelveMonthCutoff(meetingAt);
  const locations = collectSentences(validatedBrief);
  const localChecks = new Map<string, z.infer<typeof SentenceCheckSchema>>();
  const modelInputs: Array<{
    sentenceId: string;
    sentence: string;
    section: keyof SynthesisBrief;
    snippets: Array<{
      sourceId: string;
      snippet: string;
      publishedAt: string;
      background: boolean;
      blocklisted: boolean;
    }>;
  }> = [];

  locations.forEach((location, index) => {
    const sentenceId = `C${index + 1}`;
    const citedFacts = location.factIds.map((id) => factById.get(id));
    if (citedFacts.some((fact) => !fact)) {
      localChecks.set(sentenceId, {
        id: sentenceId,
        verdict: "unsupported",
        reason: "One or more cited fact IDs do not exist.",
      });
      return;
    }

    const citedSources = citedFacts.flatMap((fact) =>
      fact!.sourceIds.map((sourceId) => sourceById.get(sourceId)),
    );
    if (citedSources.length === 0 || citedSources.some((source) => !source)) {
      localChecks.set(sentenceId, {
        id: sentenceId,
        verdict: "unsupported",
        reason: "Cited facts have no available source snippets.",
      });
      return;
    }

    const resolvedSources = citedSources.filter(
      (source): source is Source => source !== undefined,
    );
    const backgroundSources = resolvedSources.filter((source) =>
      isBackgroundSource(source, startDate, candidate.officialDomain),
    );
    const invalidDateSource = resolvedSources.find(
      (source) =>
        !source.publishedAt ||
        source.publishedAt > endDate ||
        (source.publishedAt < startDate &&
          !matchesDomain(source.domain, candidate.officialDomain)),
    );
    let localReason: string | undefined;
    if (invalidDateSource) {
      localReason =
        "A cited source is missing a publication date or is outside the permitted date window.";
    } else if (
      backgroundSources.length > 0 &&
      location.section !== "summary"
    ) {
      localReason =
        "Background sources may support only the At a glance section.";
    } else if (
      resolvedSources.every((source) => isBlocklistedDomain(source.domain))
    ) {
      localReason = "A blocklisted domain cannot be the only source for a claim.";
    } else if (
      rollingYearClaimPattern.test(location.sentence) &&
      !resolvedSources.some(
        (source) =>
          source.publishedAt !== null &&
          isWithinDateRange(
            source.publishedAt,
            twelveMonthCutoff,
            endDate,
          ),
      )
    ) {
      localReason =
        "A time-period claim requires a source published within that period.";
    } else if (
      currentYearClaimPattern.test(location.sentence) &&
      !resolvedSources.some(
        (source) =>
          source.publishedAt !== null &&
          source.publishedAt.startsWith(endDate.slice(0, 4)) &&
          source.publishedAt <= endDate,
      )
    ) {
      localReason =
        "A current-year claim requires a source published during the current year.";
    }

    if (localReason) {
      localChecks.set(sentenceId, {
        id: sentenceId,
        verdict: "unsupported",
        reason: localReason,
      });
      return;
    }

    modelInputs.push({
      sentenceId,
      sentence: location.sentence,
      section: location.section,
      snippets: resolvedSources.map((source) => ({
        sourceId: source.id,
        snippet: source.snippet,
        publishedAt: source.publishedAt!,
        background: backgroundSources.includes(source),
        blocklisted: isBlocklistedDomain(source.domain),
      })),
    });
  });

  const modelChecks = new Map<string, z.infer<typeof SentenceCheckSchema>>();
  if (modelInputs.length > 0) {
    const model = process.env.MODEL_STRONG?.trim();
    if (!model) throw new Error("MODEL_STRONG is not configured.");

    for (let offset = 0; offset < modelInputs.length; offset += 10) {
      const batch = modelInputs.slice(offset, offset + 10);
      const expectedIds = batch.map(({ sentenceId }) => sentenceId);
      const BatchResponseSchema = z
        .preprocess(normalizeVerificationResponse, VerificationResponseSchema)
        .superRefine(({ checks }, context) => {
          if (!hasExpectedCheckIds(checks, expectedIds)) {
            context.addIssue({
              code: "custom",
              message: "Every sentence id must appear exactly once in checks.",
              path: ["checks"],
            });
          }
        });

      try {
        const { data } = await chatJson(
          model,
          [
            {
              role: "system",
              content:
                'Verify each sentence using ONLY its provided cited snippets. Do not use prior knowledge. Mark supported only when the snippets directly support the full sentence; mark partial when they support only part of it; mark unsupported when they do not support it. Give a concise reason based only on the snippets. A blocklisted domain cannot be the only support for a claim. Out-of-window sources from the locked firm domain may support only stable facts in the At a glance summary; such a claim must be explicitly labeled Background and dated from its cited source. Drop out-of-window sources from every other section. Drop non-official out-of-window sources everywhere. Time-period claims such as "last twelve months" or "this year" require a source published within that period. Return ONLY a JSON object with a top-level key \'checks\'. Never return a bare array. Never rename the key. Use exactly this shape: {"checks":[{"id":"<sentence id>","verdict":"supported","reason":"<short>"}]}. The verdict must be "supported", "partial", or "unsupported". Every sentence id I send must appear exactly once in checks.',
            },
            {
              role: "user",
              content: JSON.stringify({ sentences: batch }),
            },
          ],
          BatchResponseSchema,
          { stats, maxCompletionTokens: 1_200 },
        );

        data.checks.forEach((check) => modelChecks.set(check.id, check));
      } catch (error) {
        if (!isVerificationValidationError(error)) throw error;
        const reason = "Verifier response failed validation; dropped for safety.";
        for (const sentenceId of expectedIds) {
          modelChecks.set(sentenceId, {
            id: sentenceId,
            verdict: "unsupported",
            reason,
          });
        }
      }
    }
  }

  const allChecks = new Map([...localChecks, ...modelChecks]);
  const output: Record<
    string,
    Array<{
      text: string;
      factIds: string[];
      date?: string;
      verificationStatus?: "partial";
      backgroundDate?: string;
    }>
  > = {
    summary: [],
    timeline: [],
    recentInvestments: [],
    thesisDrift: [],
    portfolioConflicts: [],
    conversationStarters: [],
  };

  locations.forEach((location, index) => {
    const sentenceId = `C${index + 1}`;
    const check = allChecks.get(sentenceId);
    if (!check) throw new Error(`Missing verification result for ${sentenceId}.`);

    if (check.verdict === "unsupported") {
      stats.droppedClaims.push({
        text: location.sentence,
        reason: check.reason,
      });
      return;
    }

    const citedSources = location.factIds.flatMap(
      (factId) =>
        factById
          .get(factId)
          ?.sourceIds.map((sourceId) => sourceById.get(sourceId))
          .filter((source): source is Source => source !== undefined) ?? [],
    );
    const isBackgroundOnlyClaim =
      citedSources.length > 0 &&
      citedSources.every((source) =>
        isBackgroundSource(source, startDate, candidate.officialDomain),
      );
    const backgroundDates = [
      ...new Set(
        (isBackgroundOnlyClaim ? citedSources : [])
          .map((source) => source.publishedAt)
          .filter((date): date is string => date !== null),
      ),
    ];

    output[location.section].push({
      text: location.sentence,
      factIds: location.factIds,
      ...(location.date ? { date: location.date } : {}),
      ...(location.section === "summary" && backgroundDates.length
        ? { backgroundDate: backgroundDates.join(", ") }
        : {}),
      ...(check.verdict === "partial"
        ? { verificationStatus: "partial" as const }
        : {}),
    });
  });

  return CleanedBriefSchema.parse(output);
}
