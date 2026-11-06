import { z } from "zod";
import { chatJson } from "@/lib/llm";
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
  factIds: z.array(z.string().min(1)).min(1),
});

export const FitVerdictSchema = z.enum([
  "Strong",
  "Partial",
  "Weak",
  "Not enough evidence",
]);

export const SynthesisBriefSchema = z.object({
  atAGlance: z.array(CitedSentenceSchema),
  whatLookingForNow: z.array(CitedSentenceSchema),
  dealTermsAndProcess: z.array(CitedSentenceSchema),
  fitWithStartup: z.object({
    verdict: FitVerdictSchema,
    reasons: z.array(CitedSentenceSchema).min(2).max(3),
  }),
  recentSignals: z.object({
    items: z.array(CitedSentenceSchema),
    background: CitedSentenceSchema.nullable(),
  }),
  conversationStarters: z.array(CitedSentenceSchema),
});

export type SynthesisBrief = z.infer<typeof SynthesisBriefSchema>;

const sentenceArrays = [
  "atAGlance",
  "whatLookingForNow",
  "dealTermsAndProcess",
  "conversationStarters",
] as const;

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
  const fit = normalized.fitWithStartup;
  if (typeof fit === "object" && fit !== null && !Array.isArray(fit)) {
    const fitResult = { ...(fit as Record<string, unknown>) };
    if (Array.isArray(fitResult.reasons)) {
      fitResult.reasons = fitResult.reasons.map((entry) =>
        typeof entry === "string" ? { text: entry, factIds: [] } : entry,
      );
    }
    normalized.fitWithStartup = fitResult;
  }
  const recent = normalized.recentSignals;
  if (typeof recent === "object" && recent !== null && !Array.isArray(recent)) {
    const signals = { ...(recent as Record<string, unknown>) };
    if (Array.isArray(signals.items)) {
      signals.items = signals.items.map((entry) =>
        typeof entry === "string" ? { text: entry, factIds: [] } : entry,
      );
    }
    if (typeof signals.background === "string") {
      signals.background = {
        text: signals.background,
        factIds: [],
      };
    }
    normalized.recentSignals = signals;
  }
  return normalized;
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
  const allowedFactIds = new Set(validatedFacts.map((fact) => fact.id));
  const BriefSchemaForFacts = SynthesisBriefSchema.superRefine((brief, context) => {
    const sentences = [
      ...brief.atAGlance,
      ...brief.whatLookingForNow,
      ...brief.dealTermsAndProcess,
      ...brief.fitWithStartup.reasons,
      ...brief.recentSignals.items,
      ...(brief.recentSignals.background
        ? [brief.recentSignals.background]
        : []),
      ...brief.conversationStarters,
    ];
    sentences.forEach((sentence) => {
      if (sentence.factIds.some((factId) => !allowedFactIds.has(factId))) {
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
          `The subject is ${candidate.name} (${candidate.officialDomain}). Ignore sources about another organization with a similar name. Use only supplied facts and never assume founder details beyond the supplied form. Return JSON matching this shape: {"atAGlance":[{"text":"...","factIds":["F1"]}],"whatLookingForNow":[{"text":"...","factIds":["F2"]}],"dealTermsAndProcess":[{"text":"...","factIds":["F3"]}],"fitWithStartup":{"verdict":"Partial","reasons":[{"text":"...","factIds":["F4"]},{"text":"...","factIds":["F5"]}]},"recentSignals":{"items":[{"text":"...","factIds":["F6"]}],"background":null},"conversationStarters":[{"text":"...","factIds":["F7"]}]}. Every sentence must cite factIds. A fact should appear in only one section, choosing its most relevant section. What they're looking for now must be based only on facts whose cited sources are on the locked firm domain; include focus areas, Requests for Startups, or thesis. For older official-domain focus facts, set the wording as background and include the source date. Deal terms and process should include only sourced terms. Fit with your startup must assess sector, stage, and raise size individually against the sourced focus and deal terms; identify when evidence for a dimension is missing. Provide a verdict exactly Strong, Partial, Weak, or Not enough evidence, plus 2-3 individually cited reasons. Do not invent founder attributes or infer fit from unspecified data. Recent signals may include only facts with a source published within the 30 days ending on ${input.meetingAt.slice(0, 10)}. If none qualify, return an empty items array and put the newest eligible older item in background, if available. Conversation starters must be relevant to the supplied startup and cite facts not already used elsewhere. Do not place the same fact in multiple sections. Return "background" as null when no older item is available. Gaps are rendered separately by the application.
Never output bare strings where an object is required; each sentence item must be an object with text and factIds.`,
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
    z.preprocess(normalizeBareSentences, BriefSchemaForFacts),
    { stats, maxCompletionTokens: 1_600 },
  );

  return data;
}
