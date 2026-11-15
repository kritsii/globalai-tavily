import { z } from "zod";
import { chatJson, createRunStats } from "@/lib/llm";
import type { BriefInput, Candidate, RunStats } from "@/types";
import {
  BriefInputSchema,
  FactSchema,
  SourceSchema,
  type Fact,
  type Source,
} from "@/types";
import {
  getDateWindow,
  isBlocklistedDomain,
  isWithinDateRange,
  matchesDomain,
} from "@/lib/source-quality";
import {
  CitedSentenceSchema,
  OpenQuestionSchema,
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

const CleanedSentenceSchema = CitedSentenceSchema.extend({
  verificationStatus: z.literal("partial").optional(),
  backgroundDate: z.string().optional(),
});

const CleanedRecentSignalSchema = CleanedSentenceSchema.extend({
  date: z.string().date(),
});

export const CleanedBriefSchema = z.object({
  atAGlance: z.array(CleanedSentenceSchema).max(2),
  recentSignals: z.object({ items: z.array(CleanedRecentSignalSchema).max(5) }),
  fitWithStartup: z.object({
    verdict: z.enum(["Strong", "Partial", "Weak", "Not enough evidence"]),
    reasons: z.array(CleanedSentenceSchema).max(2),
  }),
  openQuestions: z.array(OpenQuestionSchema).length(3),
});

export type CleanedBrief = z.infer<typeof CleanedBriefSchema>;

type Section =
  | "atAGlance"
  | "recentSignals"
  | "fitWithStartup"
  | "openQuestions";

type SentenceLocation = {
  id: string;
  section: Section;
  sentence: string;
  factIds: string[];
  contextField?: z.infer<typeof OpenQuestionSchema>["contextField"];
  date?: string;
};

const dedupePriority: Section[] = [
  "recentSignals",
  "fitWithStartup",
  "atAGlance",
  "openQuestions",
];

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

// Older pages from the investor's own domain (thesis, standard deal) may
// support background context and fit reasons, never recent signals.
function backgroundAllowed(section: Section): boolean {
  return section === "atAGlance" || section === "fitWithStartup";
}

// Words that end in a period without ending the sentence ("Nov. 13", "Acme Inc.").
const NON_TERMINAL_WORDS = new Set([
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov",
  "dec", "inc", "corp", "co", "ltd", "llc", "mr", "mrs", "ms", "dr", "st", "jr",
  "sr", "vs", "etc", "approx", "no", "e.g", "i.e", "u.s", "u.k",
]);

// Split only where a new sentence clearly starts: terminal punctuation, then
// whitespace, then a capital letter, and not after an abbreviation or initial.
// A naive split on every period cut "published an essay on Nov. 13 …" in two.
// "At a glance" and "Last 30 days" restate facts, so each fact appears in at
// most one of them. Fit reasons and open questions analyse those same facts
// (one fact can support several reasons or questions), so they may reuse them.
function isSummarySection(section: Section): boolean {
  return section === "atAGlance" || section === "recentSignals";
}

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?]+["')\]]*\s+(?=["'([]?[A-Z])/g)) {
    const lastWord = text.slice(start, match.index).split(/\s+/).at(-1) ?? "";
    const word = lastWord.replace(/^["'([]+/, "").toLowerCase();
    if (NON_TERMINAL_WORDS.has(word) || /^[a-z]$/.test(word)) continue;
    const end = match.index + match[0].length;
    sentences.push(text.slice(start, end).trim());
    start = end;
  }
  sentences.push(text.slice(start).trim());
  return sentences.filter(Boolean);
}

function collectSentences(brief: SynthesisBrief): SentenceLocation[] {
  const locations: SentenceLocation[] = [];
  const addEntries = (
    section: Section,
    entries: Array<{
      text: string;
      factIds: string[];
      contextField?: z.infer<typeof OpenQuestionSchema>["contextField"];
    }>,
  ) => {
    for (const entry of entries) {
      for (const sentence of splitSentences(entry.text)) {
        locations.push({
          id: `C${locations.length + 1}`,
          section,
          sentence,
          factIds: entry.factIds,
          ...(entry.contextField ? { contextField: entry.contextField } : {}),
        });
      }
    }
  };
  addEntries("atAGlance", brief.atAGlance);
  addEntries("recentSignals", brief.recentSignals.items);
  addEntries("fitWithStartup", brief.fitWithStartup.reasons);
  addEntries("openQuestions", brief.openQuestions);
  return locations;
}

function questionMentionsContext(
  text: string,
  field: NonNullable<SentenceLocation["contextField"]>,
  briefInput: BriefInput,
): boolean {
  const value = briefInput.startup[field].trim();
  return value.length > 0 && text.toLocaleLowerCase().includes(value.toLocaleLowerCase());
}

function contextQuestions(briefInput: BriefInput) {
  return [
    {
      text: `What evidence would demonstrate demand in ${briefInput.startup.sector}?`,
      factIds: [],
      contextField: "sector" as const,
    },
    {
      text: `Which milestones matter most for a ${briefInput.startup.stage} company?`,
      factIds: [],
      contextField: "stage" as const,
    },
    {
      text: `What milestones would best support a ${briefInput.startup.raiseSize} raise?`,
      factIds: [],
      contextField: "raiseSize" as const,
    },
  ];
}

function truncateWords(text: string, maximum = 20): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maximum) return text.trim();
  return `${words.slice(0, maximum).join(" ").replace(/[.,;:!?]+$/, "")}…`;
}

export async function verifyBrief(
  brief: SynthesisBrief,
  facts: Fact[],
  sources: Source[],
  candidate: Pick<Candidate, "officialDomain">,
  meetingAt: string,
  stats: RunStats = createRunStats(),
  briefInput: BriefInput,
): Promise<CleanedBrief> {
  const validatedBrief = SynthesisBriefSchema.parse(brief);
  const validatedFacts = z.array(FactSchema).parse(facts);
  const validatedSources = z.array(SourceSchema).parse(sources);
  const input = BriefInputSchema.parse(briefInput);
  const factById = new Map(validatedFacts.map((fact) => [fact.id, fact]));
  const sourceById = new Map(validatedSources.map((source) => [source.id, source]));
  const { startDate, endDate } = getDateWindow(meetingAt);
  const locations = collectSentences(validatedBrief);
  const localChecks = new Map<string, z.infer<typeof SentenceCheckSchema>>();
  const modelInputs: Array<{
    id: string;
    sentence: string;
    section: Section;
    snippets: Array<{ sourceId: string; snippet: string; publishedAt: string }>;
  }> = [];

  for (const location of locations) {
    if (location.section === "openQuestions" && location.factIds.length === 0) {
      const field = location.contextField;
      const mentionsContext =
        field && questionMentionsContext(location.sentence, field, input);
      localChecks.set(location.id, {
        id: location.id,
        verdict: mentionsContext ? "supported" : "unsupported",
        reason: mentionsContext
          ? "Question is tied to a supplied startup field."
          : "Question is not tied to a cited fact or supplied startup context.",
      });
      continue;
    }

    const citedFacts = location.factIds.map((id) => factById.get(id));
    const citedSources = citedFacts.flatMap(
      (fact) => fact?.sourceIds.map((sourceId) => sourceById.get(sourceId)) ?? [],
    );
    const resolvedSources = citedSources.filter(
      (source): source is Source => source !== undefined,
    );
    let reason: string | undefined;

    if (
      location.factIds.length === 0 ||
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
            (!backgroundAllowed(location.section) ||
              !matchesDomain(source.domain, candidate.officialDomain))),
      )
    ) {
      reason = "A cited source is undated or outside the permitted date window.";
    } else if (
      location.section === "recentSignals" &&
      resolvedSources.some(
        (source) =>
          !source.publishedAt ||
          !isWithinDateRange(source.publishedAt, startDate, endDate),
      )
    ) {
      reason = "Last 30 days items must cite sources published within the 30-day window.";
    } else if (
      location.section === "recentSignals" &&
      resolvedSources.some((source) => isBlocklistedDomain(source.domain))
    ) {
      reason = "A blocklisted domain cannot support a recent signal.";
    } else if (
      !backgroundAllowed(location.section) &&
      resolvedSources.some((source) =>
        isBackgroundSource(source, startDate, candidate.officialDomain),
      )
    ) {
      reason =
        "Older official facts may appear only as Background in At a glance or Fit.";
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
      const BatchSchema = VerificationResponseSchema.superRefine(
        ({ checks }, context) => {
          const received = checks.map(({ id }) => id);
          if (
            received.length !== expectedIds.length ||
            new Set(received).size !== expectedIds.length ||
            expectedIds.some((id) => !received.includes(id))
          ) {
            context.addIssue({
              code: "custom",
              message: "Every sentence id must appear exactly once in checks.",
              path: ["checks"],
            });
          }
        },
      );
      const { data } = await chatJson(
        model,
        [
          {
            role: "system",
            content:
              'Verify each brief bullet using only its cited snippets. Mark supported only when snippets support the full bullet; partial when only part is supported; otherwise unsupported. Bullets in section "fitWithStartup" compare the investor with the founder\'s startup: treat statements about the startup as supported when they match the supplied startup fields, but every claim about the investor must still be supported by the snippets. Return ONLY {"checks":[{"id":"<sentence id>","verdict":"supported","reason":"<short>"}]}. Every supplied id must appear exactly once.',
          },
          {
            role: "user",
            content: JSON.stringify({ startup: input.startup, sentences: batch }),
          },
        ],
        BatchSchema,
        { stats, maxCompletionTokens: 1_000 },
      );
      data.checks.forEach((check) => modelChecks.set(check.id, check));
    }
  }

  const checks = new Map([...localChecks, ...modelChecks]);
  const accepted = new Map<
    string,
    {
      location: SentenceLocation;
      verdict: "supported" | "partial";
      backgroundDate?: string;
      date?: string;
    }
  >();
  const orderedLocations = [...locations].sort(
    (left, right) =>
      dedupePriority.indexOf(left.section) -
      dedupePriority.indexOf(right.section),
  );
  const usedFactIds = new Set<string>();

  for (const location of orderedLocations) {
    const check = checks.get(location.id);
    if (!check) throw new Error(`Missing verification result for ${location.id}.`);
    const isDuplicate =
      isSummarySection(location.section) &&
      location.factIds.some((factId) => usedFactIds.has(factId));
    if (check.verdict === "unsupported" || isDuplicate) {
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
    const signalDate =
      location.section === "recentSignals"
        ? relatedSources
            .map((source) => source.publishedAt)
            .filter((date): date is string => date !== null)
            .sort()
            .at(-1)
        : undefined;
    if (isSummarySection(location.section)) {
      for (const factId of location.factIds) usedFactIds.add(factId);
    }
    accepted.set(location.id, {
      location,
      verdict: check.verdict,
      ...(backgroundDates.length
        ? { backgroundDate: backgroundDates.join(", ") }
        : {}),
      ...(signalDate ? { date: signalDate } : {}),
    });
  }

  const entriesFor = (section: Section) =>
    locations.flatMap((location) => {
      if (location.section !== section) return [];
      const item = accepted.get(location.id);
      if (!item) return [];
      return [
        {
          text: location.sentence,
          factIds: location.factIds,
          ...(item.backgroundDate ? { backgroundDate: item.backgroundDate } : {}),
          ...(item.date ? { date: item.date } : {}),
          ...(item.verdict === "partial"
            ? { verificationStatus: "partial" as const }
            : {}),
          ...(location.contextField
            ? { contextField: location.contextField }
            : {}),
        },
      ];
    });

  const openQuestions = entriesFor("openQuestions").slice(0, 3);
  const usedContextFields = new Set(
    openQuestions.flatMap((question) =>
      question.contextField ? [question.contextField] : [],
    ),
  );
  for (const question of contextQuestions(input)) {
    if (openQuestions.length === 3) break;
    if (
      !usedContextFields.has(question.contextField) &&
      !openQuestions.some((item) => item.text === question.text)
    ) {
      openQuestions.push(question);
      usedContextFields.add(question.contextField);
    }
  }
  const usedQuestions = new Set(openQuestions.map((question) => question.text));
  for (const question of contextQuestions(input)) {
    if (openQuestions.length === 3) break;
    const fallback = {
      ...question,
      text: truncateWords(`${question.text.replace(/\?$/, "")} for this startup?`),
    };
    if (!usedQuestions.has(fallback.text)) {
      openQuestions.push(fallback);
      usedQuestions.add(fallback.text);
    }
  }

  const fitReasons = entriesFor("fitWithStartup").slice(0, 2);
  return CleanedBriefSchema.parse({
    atAGlance: entriesFor("atAGlance")
      .slice(0, 2)
      .map((entry) => ({ ...entry, text: truncateWords(entry.text) })),
    recentSignals: {
      items: entriesFor("recentSignals")
        .slice(0, 5)
        .map((entry) => ({ ...entry, text: truncateWords(entry.text) })),
    },
    fitWithStartup: {
      verdict:
        fitReasons.length === 0
          ? "Not enough evidence"
          : validatedBrief.fitWithStartup.verdict,
      reasons: fitReasons.map((entry) => ({
        ...entry,
        text: truncateWords(entry.text),
      })),
    },
    openQuestions: openQuestions.map((entry) => ({
      ...entry,
      text: truncateWords(entry.text),
    })),
  });
}
