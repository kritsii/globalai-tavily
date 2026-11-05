import { z } from "zod";
import {
  SearchQueryCategorySchema,
  type SearchQueryCategory,
} from "@/lib/pipeline/plan";
import {
  ResearchResultSchema,
  type ResearchResult,
} from "@/lib/pipeline/research";
import {
  CleanedBriefSchema,
  type CleanedBrief,
} from "@/lib/pipeline/verify";
import {
  FactSchema,
  GapSchema,
  SourceSchema,
  type Fact,
  type Gap,
  type Source,
} from "@/types";

export const FactConfidenceSchema = z.enum(["Confirmed", "Single-source"]);

export const FinalizedFactSchema = FactSchema.extend({
  confidence: FactConfidenceSchema,
});

export const NumberedSourceSchema = SourceSchema.extend({
  number: z.number().int().positive(),
});

export const FinalizedBriefSchema = z.object({
  brief: CleanedBriefSchema,
  facts: z.array(FinalizedFactSchema),
  gaps: z.array(GapSchema),
  stalenessWarning: z.string().nullable(),
  sources: z.array(NumberedSourceSchema),
});

export type FactConfidence = z.infer<typeof FactConfidenceSchema>;
export type FinalizedFact = z.infer<typeof FinalizedFactSchema>;
export type NumberedSource = z.infer<typeof NumberedSourceSchema>;
export type FinalizedBrief = z.infer<typeof FinalizedBriefSchema>;

const TopicLabels: Record<SearchQueryCategory, string> = {
  firm_news: "Firm news",
  new_investments: "New investments",
  partner_posts_interviews: "Partner posts and interviews",
  portfolio_news: "Portfolio news",
  thesis_statements: "Thesis statements",
  sector_competitors: "Sector competitors",
};

function getFactConfidence(
  fact: Fact,
  sourcesById: Map<string, Source>,
): FactConfidence {
  const domains = new Set(
    fact.sourceIds.map((sourceId) => {
      const source = sourcesById.get(sourceId);
      if (!source) {
        throw new Error(
          `Fact ${fact.id} cites unknown source ID ${sourceId}.`,
        );
      }
      return source.domain.toLowerCase().replace(/^www\./, "");
    }),
  );

  return domains.size >= 2 ? "Confirmed" : "Single-source";
}

function findGaps(
  facts: Fact[],
  sourceIdsByCategory: ResearchResult["sourceIdsByCategory"],
): Gap[] {
  const categories = SearchQueryCategorySchema.options;
  const factSourceIds = new Set(facts.flatMap((fact) => fact.sourceIds));

  return categories
    .filter((category) => {
      const categorySourceIds = sourceIdsByCategory[category];
      return !categorySourceIds.some((sourceId) =>
        factSourceIds.has(sourceId),
      );
    })
    .map((category) => ({
      topic: TopicLabels[category],
      description: `${TopicLabels[category]} not found in sources searched.`,
    }));
}

export function finalizeBrief(
  brief: CleanedBrief,
  facts: Fact[],
  researchResult: ResearchResult,
): FinalizedBrief {
  const validatedBrief = CleanedBriefSchema.parse(brief);
  const validatedFacts = z.array(FactSchema).parse(facts);
  const validatedResearch = ResearchResultSchema.parse(researchResult);
  const sourcesById = new Map(
    validatedResearch.sources.map((source) => [source.id, source]),
  );

  const finalizedFacts = validatedFacts.map((fact) =>
    FinalizedFactSchema.parse({
      ...fact,
      confidence: getFactConfidence(fact, sourcesById),
    }),
  );
  const gaps = findGaps(
    validatedFacts,
    validatedResearch.sourceIdsByCategory,
  );
  const sources = validatedResearch.sources.map((source, index) => ({
    ...source,
    number: index + 1,
  }));

  return FinalizedBriefSchema.parse({
    brief: validatedBrief,
    facts: finalizedFacts,
    gaps,
    stalenessWarning: validatedResearch.stale
      ? "Research may be stale: no source was published within 7 days before the meeting date."
      : null,
    sources,
  });
}
