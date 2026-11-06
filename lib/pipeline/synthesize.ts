import { z } from "zod";
import { chatJson } from "@/lib/llm";
import {
  BriefInputSchema,
  FactSchema,
  type BriefInput,
  type Fact,
  type RunStats,
} from "@/types";

const CitedSentenceSchema = z.object({
  text: z.string().trim().min(1),
  factIds: z.array(z.string().min(1)).min(1),
});

const TimelineEntrySchema = CitedSentenceSchema.extend({
  date: z.string().trim().min(1),
});

const CitedSentenceSections = [
  "summary",
  "timeline",
  "recentInvestments",
  "thesisDrift",
  "portfolioConflicts",
  "conversationStarters",
] as const;

function normalizeBareSentences(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = { ...value };
  for (const section of CitedSentenceSections) {
    const entries = normalized[section];
    if (Array.isArray(entries)) {
      normalized[section] = entries.map((entry) =>
        typeof entry === "string" ? { text: entry, factIds: [] } : entry,
      );
    }
  }
  return normalized;
}

export const SynthesisBriefSchema = z.object({
  summary: z.tuple([CitedSentenceSchema, CitedSentenceSchema]),
  timeline: z.array(TimelineEntrySchema),
  recentInvestments: z.array(CitedSentenceSchema),
  thesisDrift: z.array(CitedSentenceSchema).default([]),
  portfolioConflicts: z.array(CitedSentenceSchema),
  conversationStarters: z.array(CitedSentenceSchema).length(3),
});

export type SynthesisBrief = z.output<typeof SynthesisBriefSchema>;

export async function synthesizeBrief(
  facts: Fact[],
  briefInput: BriefInput,
  stats?: RunStats,
): Promise<SynthesisBrief> {
  const validatedFacts = z.array(FactSchema).parse(facts);
  if (validatedFacts.length === 0) {
    throw new Error("Cannot synthesize a brief without verified facts.");
  }

  const input = BriefInputSchema.parse(briefInput);
  const factById = new Map(validatedFacts.map((fact) => [fact.id, fact]));
  const allowedFactIds = new Set(factById.keys());
  const BriefSchemaForFacts = SynthesisBriefSchema.superRefine((brief, context) => {
    const citedSentences = [
      ...brief.summary,
      ...brief.timeline,
      ...brief.recentInvestments,
      ...brief.thesisDrift,
      ...brief.portfolioConflicts,
      ...brief.conversationStarters,
    ];

    citedSentences.forEach((sentence, index) => {
      if (sentence.factIds.some((factId) => !allowedFactIds.has(factId))) {
        context.addIssue({
          code: "custom",
          message: "Every sentence must cite only provided fact IDs.",
          path: [index, "factIds"],
        });
      }
    });

    brief.timeline.forEach((entry, index) => {
      const hasMatchingFactDate = entry.factIds.some(
        (factId) => factById.get(factId)?.date === entry.date,
      );
      if (!hasMatchingFactDate) {
        context.addIssue({
          code: "custom",
          message: "Timeline dates must match a date on a cited fact.",
          path: ["timeline", index, "date"],
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
          `Return valid JSON for an investor brief using ONLY the provided facts. Do not use outside knowledge, add context, make assumptions, or infer unsupported claims. Every sentence must include one or more exact factIds that support it. The summary must contain exactly two sentences. Timeline entries must use dates exactly as stated on cited facts. Include recent investments only when directly evidenced by facts. Include thesisDrift only when facts show an evidence-backed change in thesis; otherwise return an empty array. Include portfolioConflicts only when facts directly support a comparison or conflict with the founder's startup; otherwise return an empty array. Provide exactly three conversation starters, each tied to at least one fact and explicitly relevant to the founder's startup. For any unsupported point, omit it rather than filling gaps.

Return sentence entries as objects, never strings. Example:
{
  "summary": [{"text": "...", "factIds": ["F1", "F2"]}, {"text": "...", "factIds": ["F3"]}],
  "timeline": [{"date": "...", "text": "...", "factIds": ["F1"]}],
  "recentInvestments": [{"text": "...", "factIds": ["F2"]}],
  "thesisDrift": [{"text": "...", "factIds": ["F3"]}],
  "portfolioConflicts": [{"text": "...", "factIds": ["F1"]}],
  "conversationStarters": [{"text": "...", "factIds": ["F1"]}, {"text": "...", "factIds": ["F2"]}, {"text": "...", "factIds": ["F3"]}]
}
Never output a bare string where an object is required. Every item must include text and factIds.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          startup: input.startup,
          facts: validatedFacts,
        }),
      },
    ],
    z.preprocess(normalizeBareSentences, BriefSchemaForFacts),
    { stats, maxCompletionTokens: 1_200 },
  );

  return data;
}
