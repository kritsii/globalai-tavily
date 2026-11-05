import { z } from "zod";
import { chatJson } from "@/lib/llm";
import {
  FactSchema,
  SourceSchema,
  type Fact,
  type RunStats,
  type Source,
} from "@/types";

const ExtractedFactSchema = FactSchema.omit({ id: true });

const ExtractionResponseSchema = z.object({
  facts: z.array(ExtractedFactSchema),
});

const MAX_SNIPPET_LENGTH = 450;

export async function extractFacts(
  sources: Source[],
  stats?: RunStats,
): Promise<Fact[]> {
  const validatedSources = z.array(SourceSchema).parse(sources);
  if (validatedSources.length === 0) return [];

  const model = process.env.MODEL_CHEAP?.trim();
  if (!model) throw new Error("MODEL_CHEAP is not configured.");

  const allowedSourceIds = new Set(validatedSources.map(({ id }) => id));
  const { data } = await chatJson(
    model,
    [
      {
        role: "system",
        content:
          "Extract at most one concise factual claim per source, strictly from the provided snippets. Use ONLY those snippets; do not use prior knowledge, infer unsupported details, or add facts. Each fact must cite the exact sourceId that supports it. If a snippet does not support a clear fact, omit it. Set date to a date explicitly stated in the snippet, otherwise null. Return valid JSON with a facts array.",
      },
      {
        role: "user",
        content: JSON.stringify({
          sources: validatedSources.map(({ id, snippet }) => ({
            id,
            snippet: snippet.slice(0, MAX_SNIPPET_LENGTH),
          })),
        }),
      },
    ],
    ExtractionResponseSchema,
    { stats, maxCompletionTokens: 800 },
  );

  return data.facts
    .filter((fact) => fact.sourceIds.every((sourceId) => allowedSourceIds.has(sourceId)))
    .map((fact, index) =>
      FactSchema.parse({
        ...fact,
        id: `F${index + 1}`,
      }),
    );
}
