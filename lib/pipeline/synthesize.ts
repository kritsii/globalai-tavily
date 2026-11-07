import { z } from "zod";
import { chatJson } from "@/lib/llm";
import { getDateWindow, isWithinDateRange } from "@/lib/source-quality";
import {
  BriefInputSchema,
  FactSchema,
  SourceSchema,
  type BriefInput,
  type Candidate,
  type Fact,
  type RunStats,
  type Source,
} from "@/types";

export const CitedSentenceSchema = z.object({
  text: z.string().trim().min(1),
  factIds: z.array(z.string().min(1)),
});

export const RecentSignalSchema = CitedSentenceSchema;

export const StartupContextFieldSchema = z.enum(["sector", "stage", "raiseSize"]);

export const OpenQuestionSchema = CitedSentenceSchema.extend({
  contextField: StartupContextFieldSchema.optional(),
}).superRefine(({ factIds, contextField }, context) => {
  if (factIds.length === 0 && !contextField) {
    context.addIssue({
      code: "custom",
      message: "An open question must cite a fact or identify its startup context.",
      path: ["contextField"],
    });
  }
});

export const FitVerdictSchema = z.enum([
  "Strong",
  "Partial",
  "Weak",
  "Not enough evidence",
]);

export const SynthesisBriefSchema = z.object({
  atAGlance: z.array(CitedSentenceSchema),
  recentSignals: z.object({ items: z.array(RecentSignalSchema) }),
  fitWithStartup: z.object({
    verdict: FitVerdictSchema,
    reasons: z.array(CitedSentenceSchema),
  }),
  openQuestions: z.array(OpenQuestionSchema),
});

export type SynthesisBrief = z.infer<typeof SynthesisBriefSchema>;

const sentenceArrays = ["atAGlance"] as const;

function normalizeBareSentences(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const normalized: Record<string, unknown> = { ...value };
  for (const section of sentenceArrays) {
    const entries = normalized[section];
    if (Array.isArray(entries)) {
      normalized[section] = entries.map((entry) =>
        typeof entry === "string" ? { text: entry, factIds: [] } : entry,
      );
    }
  }
  const signals = normalized.recentSignals;
  if (typeof signals === "object" && signals !== null && !Array.isArray(signals)) {
    const recent = { ...(signals as Record<string, unknown>) };
    if (Array.isArray(recent.items)) {
      recent.items = recent.items.map((entry) =>
        typeof entry === "string" ? { text: entry, factIds: [] } : entry,
      );
    }
    normalized.recentSignals = recent;
  }
  const fit = normalized.fitWithStartup;
  if (typeof fit === "object" && fit !== null && !Array.isArray(fit)) {
    const result = { ...(fit as Record<string, unknown>) };
    if (Array.isArray(result.reasons)) {
      result.reasons = result.reasons.map((entry) =>
        typeof entry === "string" ? { text: entry, factIds: [] } : entry,
      );
    }
    normalized.fitWithStartup = result;
  }
  return normalized;
}

function truncateWords(text: string, maximum = 20): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maximum) return text.trim();
  return `${words.slice(0, maximum).join(" ").replace(/[.,;:!?]+$/, "")}…`;
}

function makeContextQuestions(input: BriefInput): z.infer<typeof OpenQuestionSchema>[] {
  const questions: Array<{
    text: string;
    factIds: string[];
    contextField: "sector" | "stage" | "raiseSize";
  }> = [
    {
      text: `What evidence would demonstrate demand in ${input.startup.sector}?`,
      factIds: [],
      contextField: "sector",
    },
    {
      text: `Which milestones matter most for a ${input.startup.stage} company?`,
      factIds: [],
      contextField: "stage",
    },
    {
      text: `What milestones would best support a ${input.startup.raiseSize} raise?`,
      factIds: [],
      contextField: "raiseSize",
    },
  ];
  return questions.map((question) => ({
    ...question,
    text: truncateWords(question.text),
  }));
}

export async function synthesizeBrief(
  facts: Fact[],
  sources: Source[],
  briefInput: BriefInput,
  candidate: Pick<Candidate, "name" | "officialDomain">,
  stats?: RunStats,
): Promise<SynthesisBrief> {
  const validatedFacts = z.array(FactSchema).parse(facts);
  const validatedSources = z.array(SourceSchema).parse(sources);
  if (validatedFacts.length === 0) {
    throw new Error("Cannot synthesize a brief without verified facts.");
  }

  const input = BriefInputSchema.parse(briefInput);
  const sourceById = new Map(validatedSources.map((source) => [source.id, source]));
  const factById = new Map(validatedFacts.map((fact) => [fact.id, fact]));
  const { startDate, endDate } = getDateWindow(input.meetingAt);
  const allowedFactIds = new Set(validatedFacts.map((fact) => fact.id));
  const BriefSchemaForFacts = z
    .preprocess(normalizeBareSentences, SynthesisBriefSchema)
    .superRefine((brief, context) => {
      const entries = [
        ...brief.atAGlance,
        ...brief.recentSignals.items,
        ...brief.fitWithStartup.reasons,
        ...brief.openQuestions,
      ];
      entries.forEach((entry) => {
        if (entry.factIds.some((factId) => !allowedFactIds.has(factId))) {
          context.addIssue({
            code: "custom",
            message: "Every sentence must cite only provided fact IDs.",
            path: ["factIds"],
          });
        }
      });
    });

  const model = process.env.MODEL_STRONG?.trim();
  if (!model) throw new Error("MODEL_STRONG is not configured.");

  const { data } = await chatJson(
    model,
    [
      {
        role: "system",
        content:
          `Create a compact investor brief using only the supplied facts and startup fields; never assume any founder detail beyond those fields. Return JSON shaped as {"atAGlance":[{"text":"...","factIds":["F1"]}],"recentSignals":{"items":[{"text":"...","factIds":["F2"]}]},"fitWithStartup":{"verdict":"Partial","reasons":[{"text":"...","factIds":["F3"]}]},"openQuestions":[{"text":"...","factIds":["F4"]},{"text":"...","factIds":[],"contextField":"sector"},{"text":"...","factIds":[],"contextField":"stage"}]}. Use at most 2 atAGlance sentences, at most 5 recentSignals items, at most 2 fit reasons, and exactly 3 open questions. Every bullet or question must be at most 20 words. Keep recent signal items to one short dated-event claim each; code will attach the source publication date. Include only items with cited sources published within the 30 days ending ${endDate}; never move older items into this section. Older facts may appear only in atAGlance and only when a cited source is on the subject's official domain; these are labeled Background by the application. Do not duplicate facts between sections. Every fact-based sentence must cite its exact factIds. An open question must cite a relevant fact or identify contextField as one of sector, stage, or raiseSize and explicitly mention that submitted value. Fit reasons must compare only the supplied sector, stage, and raise size to sourced investor evidence; do not infer missing founder details. If evidence is insufficient, say so in the verdict and reasons. Gaps and source list are rendered separately. Keep every item concise and return valid JSON only.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          meetingAt: input.meetingAt,
          startup: input.startup,
          facts: validatedFacts.map((fact) => ({
            ...fact,
            citedSources: fact.sourceIds
              .map((sourceId) => sourceById.get(sourceId))
              .filter((source): source is Source => source !== undefined)
              .map(({ id, domain, publishedAt, background }) => ({
                id,
                domain,
                publishedAt,
                background,
              })),
          })),
        }),
      },
    ],
    BriefSchemaForFacts,
    { stats, maxCompletionTokens: 1_100 },
  );

  const inWindow = (factIds: string[]) => {
    const citedSources = factIds.flatMap(
      (factId) =>
        factById.get(factId)?.sourceIds
          .map((sourceId) => sourceById.get(sourceId))
          .filter((source): source is Source => source !== undefined) ?? [],
    );
    return (
      citedSources.length > 0 &&
      citedSources.every(
        (source) =>
          source.publishedAt !== null &&
          isWithinDateRange(source.publishedAt, startDate, endDate),
      )
    );
  };

  const openQuestions = data.openQuestions
    .slice(0, 3)
    .map((question) => ({
      ...question,
      text: truncateWords(question.text),
    }));
  for (const question of makeContextQuestions(input)) {
    if (openQuestions.length >= 3) break;
    openQuestions.push(question);
  }

  return SynthesisBriefSchema.parse({
    atAGlance: data.atAGlance
      .slice(0, 2)
      .map((entry) => ({ ...entry, text: truncateWords(entry.text) })),
    recentSignals: {
      items: data.recentSignals.items
        .filter((entry) => inWindow(entry.factIds))
        .slice(0, 5)
        .map((entry) => ({
          ...entry,
          text: truncateWords(entry.text),
        })),
    },
    fitWithStartup: {
      verdict: data.fitWithStartup.verdict,
      reasons: data.fitWithStartup.reasons
        .filter((entry) => inWindow(entry.factIds))
        .slice(0, 2)
        .map((entry) => ({ ...entry, text: truncateWords(entry.text) })),
    },
    openQuestions,
  });
}
