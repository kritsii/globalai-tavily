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
  CitedSentenceSchema,
  FitVerdictSchema,
  SynthesisBriefSchema,
  type SynthesisBrief,
} from "@/lib/pipeline/synthesize";

const SentenceCheckSchema = z.object({
  id: z.string().min(1),
  verdict: z.enum(["supported", "unsupported", "partial"]),
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
    if (Array.isArray(response[key])) return { ...response, checks: response[key] };
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

const CleanedSentenceSchema = CitedSentenceSchema.extend({
  verificationStatus: z.literal("partial").optional(),
  backgroundDate: z.string().optional(),
});

export const CleanedBriefSchema = z.object({
  atAGlance: z.array(CleanedSentenceSchema),
  whatLookingForNow: z.array(CleanedSentenceSchema),
  dealTermsAndProcess: z.array(CleanedSentenceSchema),
  fitWithStartup: z.object({
    verdict: FitVerdictSchema,
    reasons: z.array(CleanedSentenceSchema),
  }),
  recentSignals: z.object({
    items: z.array(CleanedSentenceSchema),
    background: CleanedSentenceSchema.nullable(),
  }),
  conversationStarters: z.array(CleanedSentenceSchema),
});

export type CleanedBrief = z.infer<typeof CleanedBriefSchema>;

type Section =
  | "atAGlance"
  | "whatLookingForNow"
  | "dealTermsAndProcess"
  | "fitWithStartup"
  | "recentSignals"
  | "recentSignalsBackground"
  | "conversationStarters";

type SentenceLocation = {
  id: string;
  section: Section;
  sentence: string;
  factIds: string[];
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
    section: Section,
    entries: Array<{ text: string; factIds: string[] }>,
  ) => {
    for (const entry of entries) {
      for (const sentence of splitSentences(entry.text)) {
        locations.push({
          id: `C${locations.length + 1}`,
          section,
          sentence,
          factIds: entry.factIds,
        });
      }
    }
  };
  addEntries("atAGlance", brief.atAGlance);
  addEntries("whatLookingForNow", brief.whatLookingForNow);
  addEntries("dealTermsAndProcess", brief.dealTermsAndProcess);
  addEntries("fitWithStartup", brief.fitWithStartup.reasons);
  addEntries("recentSignals", brief.recentSignals.items);
  if (brief.recentSignals.background) {
    addEntries("recentSignalsBackground", [brief.recentSignals.background]);
  }
  addEntries("conversationStarters", brief.conversationStarters);
  return locations;
}

function expectedIdsMatch(
  checks: z.infer<typeof SentenceCheckSchema>[],
  ids: string[],
): boolean {
  const received = checks.map(({ id }) => id);
  return (
    received.length === ids.length &&
    new Set(received).size === ids.length &&
    ids.every((id) => received.includes(id))
  );
}

const dedupePriority: Section[] = [
  "recentSignals",
  "recentSignalsBackground",
  "whatLookingForNow",
  "dealTermsAndProcess",
  "fitWithStartup",
  "atAGlance",
  "conversationStarters",
];

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
  const factSourceIds = new Set(
    validatedFacts.flatMap((fact) => fact.sourceIds),
  );
  const newestBackgroundDate = validatedSources
    .filter(
      (source) =>
        factSourceIds.has(source.id) &&
        source.publishedAt !== null &&
        source.publishedAt < startDate &&
        matchesDomain(source.domain, candidate.officialDomain),
    )
    .reduce<string | null>(
      (newest, source) =>
        source.publishedAt && (!newest || source.publishedAt > newest)
          ? source.publishedAt
          : newest,
      null,
    );
  const locations = collectSentences(validatedBrief);
  const localChecks = new Map<string, z.infer<typeof SentenceCheckSchema>>();
  const modelInputs: Array<{
    id: string;
    sentence: string;
    section: Section;
    snippets: Array<{
      sourceId: string;
      snippet: string;
      publishedAt: string;
      background: boolean;
      blocklisted: boolean;
    }>;
  }> = [];

  for (const location of locations) {
    const citedFacts = location.factIds.map((id) => factById.get(id));
    const citedSources = citedFacts.flatMap((fact) =>
      fact?.sourceIds.map((sourceId) => sourceById.get(sourceId)) ?? [],
    );
    const resolvedSources = citedSources.filter(
      (source): source is Source => source !== undefined,
    );
    let reason: string | undefined;

    if (
      citedFacts.some((fact) => !fact) ||
      resolvedSources.length === 0 ||
      resolvedSources.length !== citedSources.length
    ) {
      reason = "One or more cited facts or sources are unavailable.";
    } else if (
      resolvedSources.some(
        (source) =>
          !source.publishedAt ||
          source.publishedAt > endDate ||
          (source.publishedAt < startDate &&
            !matchesDomain(source.domain, candidate.officialDomain)),
      )
    ) {
      reason = "A cited source is undated or outside the permitted date window.";
    } else if (
      location.section === "whatLookingForNow" &&
      resolvedSources.some(
        (source) => !matchesDomain(source.domain, candidate.officialDomain),
      )
    ) {
      reason = "Current focus claims must cite the locked firm's domain.";
    } else if (
      location.section === "recentSignals" &&
      resolvedSources.some(
        (source) =>
          !source.publishedAt ||
          !isWithinDateRange(source.publishedAt, startDate, endDate),
      )
    ) {
      reason = "Recent signals must be supported by sources in the 30-day window.";
    } else if (
      location.section === "recentSignalsBackground" &&
      resolvedSources.some(
        (source) =>
          !isBackgroundSource(source, startDate, candidate.officialDomain),
      )
    ) {
      reason = "The older recent-signal item must be dated background from the firm.";
    } else if (
      location.section === "recentSignalsBackground" &&
      newestBackgroundDate &&
      !resolvedSources.some(
        (source) => source.publishedAt === newestBackgroundDate,
      )
    ) {
      reason = "The background signal must be the newest older sourced item.";
    } else if (
      resolvedSources.some((source) =>
        isBackgroundSource(source, startDate, candidate.officialDomain),
      ) &&
      ![
        "atAGlance",
        "whatLookingForNow",
        "recentSignalsBackground",
      ].includes(location.section)
    ) {
      reason = "Background facts are not allowed in this section.";
    } else if (
      (location.section === "recentSignals" ||
        location.section === "recentSignalsBackground") &&
      resolvedSources.every((source) => isBlocklistedDomain(source.domain))
    ) {
      reason = "A blocklisted domain cannot be the only support for a claim.";
    } else if (
      rollingYearClaimPattern.test(location.sentence) &&
      !resolvedSources.some(
        (source) =>
          source.publishedAt !== null &&
          isWithinDateRange(source.publishedAt, twelveMonthCutoff, endDate),
      )
    ) {
      reason = "A rolling-year claim requires a source published within that period.";
    } else if (
      currentYearClaimPattern.test(location.sentence) &&
      !resolvedSources.some(
        (source) =>
          source.publishedAt !== null &&
          source.publishedAt.startsWith(endDate.slice(0, 4)) &&
          source.publishedAt <= endDate,
      )
    ) {
      reason = "A current-year claim requires a source published during that year.";
    }

    if (reason) {
      localChecks.set(location.id, {
        id: location.id,
        verdict: "unsupported",
        reason,
      });
    } else {
      modelInputs.push({
        ...location,
        snippets: resolvedSources.map((source) => ({
          sourceId: source.id,
          snippet: source.snippet,
          publishedAt: source.publishedAt!,
          background: isBackgroundSource(
            source,
            startDate,
            candidate.officialDomain,
          ),
          blocklisted: isBlocklistedDomain(source.domain),
        })),
      });
    }
  }

  const modelChecks = new Map<string, z.infer<typeof SentenceCheckSchema>>();
  if (modelInputs.length) {
    const model = process.env.MODEL_STRONG?.trim();
    if (!model) throw new Error("MODEL_STRONG is not configured.");
    for (let offset = 0; offset < modelInputs.length; offset += 10) {
      const batch = modelInputs.slice(offset, offset + 10);
      const expectedIds = batch.map(({ id }) => id);
      const BatchSchema = z
        .preprocess(normalizeVerificationResponse, VerificationResponseSchema)
        .superRefine(({ checks }, context) => {
          if (!expectedIdsMatch(checks, expectedIds)) {
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
                'Verify each sentence using only its cited snippets. A blocklisted domain cannot be the only support. Mark supported only when snippets support the full sentence; partial when only part is supported; otherwise unsupported. Return ONLY {"checks":[{"id":"<sentence id>","verdict":"supported","reason":"<short>"}]}. Never return a bare array or rename the key. Every supplied id must appear exactly once.',
            },
            { role: "user", content: JSON.stringify({ sentences: batch }) },
          ],
          BatchSchema,
          { stats, maxCompletionTokens: 1_200 },
        );
        data.checks.forEach((check) => modelChecks.set(check.id, check));
      } catch (error) {
        if (!isVerificationValidationError(error)) throw error;
        for (const id of expectedIds) {
          modelChecks.set(id, {
            id,
            verdict: "unsupported",
            reason: "Verifier response failed validation; dropped for safety.",
          });
        }
      }
    }
  }

  const checks = new Map([...localChecks, ...modelChecks]);
  const accepted = new Map<string, {
    location: SentenceLocation;
    verdict: "supported" | "partial";
    backgroundDate?: string;
  }>();
  const orderedLocations = [...locations].sort(
    (left, right) =>
      dedupePriority.indexOf(left.section) -
      dedupePriority.indexOf(right.section),
  );
  const usedFactIds = new Set<string>();

  for (const location of orderedLocations) {
    const check = checks.get(location.id);
    if (!check) throw new Error(`Missing verification result for ${location.id}.`);
    if (
      check.verdict === "unsupported" ||
      location.factIds.some((factId) => usedFactIds.has(factId))
    ) {
      stats.droppedClaims.push({
        text: location.sentence,
        reason:
          check.verdict === "unsupported"
            ? check.reason
            : "Duplicate fact already appears in a more relevant brief section.",
      });
      continue;
    }

    const relatedSources = location.factIds.flatMap(
      (factId) =>
        factById
          .get(factId)
          ?.sourceIds.map((sourceId) => sourceById.get(sourceId))
          .filter((source): source is Source => source !== undefined) ?? [],
    );
    const backgroundDates = [
      ...new Set(
        relatedSources
          .filter((source) =>
            isBackgroundSource(source, startDate, candidate.officialDomain),
          )
          .map((source) => source.publishedAt)
          .filter((date): date is string => date !== null),
      ),
    ];
    for (const factId of location.factIds) usedFactIds.add(factId);
    accepted.set(location.id, {
      location,
      verdict: check.verdict,
      ...(backgroundDates.length
        ? { backgroundDate: backgroundDates.join(", ") }
        : {}),
    });
  }

  const entriesFor = (section: Section) =>
    locations.flatMap((location) => {
      if (location.section !== section) return [];
      const item = accepted.get(location.id);
      if (!item) return [];
      return [{
        text: location.sentence,
        factIds: location.factIds,
        ...(item.backgroundDate ? { backgroundDate: item.backgroundDate } : {}),
        ...(item.verdict === "partial"
          ? { verificationStatus: "partial" as const }
          : {}),
      }];
    });
  const fitReasons = entriesFor("fitWithStartup");

  return CleanedBriefSchema.parse({
    atAGlance: entriesFor("atAGlance"),
    whatLookingForNow: entriesFor("whatLookingForNow"),
    dealTermsAndProcess: entriesFor("dealTermsAndProcess"),
    fitWithStartup: {
      verdict:
        fitReasons.length < 2
          ? "Not enough evidence"
          : validatedBrief.fitWithStartup.verdict,
      reasons: fitReasons,
    },
    recentSignals: {
      items: entriesFor("recentSignals"),
      background: entriesFor("recentSignalsBackground")[0] ?? null,
    },
    conversationStarters: entriesFor("conversationStarters"),
  });
}
