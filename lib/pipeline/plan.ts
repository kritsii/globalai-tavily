import { z } from "zod";
import { chatJson } from "@/lib/llm";
import {
  BriefInputSchema,
  CandidateSchema,
  type BriefInput,
  type Candidate,
  type RunStats,
} from "@/types";

export const SearchQueryCategorySchema = z.enum([
  "firm_news",
  "new_investments",
  "partner_posts_interviews",
  "portfolio_news",
  "thesis_statements",
  "sector_competitors",
]);

export const SearchQuerySchema = z.object({
  category: SearchQueryCategorySchema,
  query: z.string().trim().min(3),
  includeDomains: z.array(z.string().trim().min(1)).optional(),
});

export const SearchPlanSchema = z
  .object({
    queries: z.array(SearchQuerySchema).min(6).max(10),
  })
  .superRefine(({ queries }, context) => {
    const categories = new Set(queries.map(({ category }) => category));
    for (const category of SearchQueryCategorySchema.options) {
      if (!categories.has(category)) {
        context.addIssue({
          code: "custom",
          message: `Missing required query category: ${category}`,
          path: ["queries"],
        });
      }
    }
  });

export type SearchQueryCategory = z.infer<typeof SearchQueryCategorySchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchPlan = z.infer<typeof SearchPlanSchema>;

function quoteFirmName(query: string, firmName: string): string {
  const quotedName = `"${firmName}"`;
  return query.toLocaleLowerCase().includes(quotedName.toLocaleLowerCase())
    ? query
    : `${quotedName} ${query}`;
}

export async function planSearchQueries(
  candidate: Candidate,
  briefInput: BriefInput,
  stats?: RunStats,
): Promise<SearchPlan> {
  const selectedCandidate = CandidateSchema.parse(candidate);
  const input = BriefInputSchema.parse(briefInput);
  const model = process.env.MODEL_CHEAP?.trim();
  if (!model) throw new Error("MODEL_CHEAP is not configured.");

  const { data } = await chatJson(
    model,
    [
      {
        role: "system",
        content:
          'Return valid JSON shaped as {"queries":[{"category":"firm_news","query":"..."}]}. Create 6 to 10 distinct, directly searchable queries and include every category exactly as spelled here: "firm_news", "new_investments", "partner_posts_interviews", "portfolio_news", "thesis_statements", "sector_competitors". Each query category must be exactly one of those six values; do not invent, rename, or abbreviate categories. Every query must quote the full firm name exactly. Tailor queries to the selected investor and startup. For sector competitors, search for companies in the sector without asserting or inventing competitor names.',
      },
      {
        role: "user",
        content: JSON.stringify({
          selectedCandidate,
          startup: input.startup,
          investor: input.investor,
          meetingType: input.meetingType,
        }),
      },
    ],
    SearchPlanSchema,
    { stats, maxCompletionTokens: 800 },
  );

  const queries = data.queries.map(({ category, query }) => ({
    category,
    query: quoteFirmName(query, selectedCandidate.name),
  }));
  const dedicatedDomainQuery = SearchQuerySchema.parse({
    category: "firm_news",
    query: `"${selectedCandidate.name}" official website portfolio blog news`,
    includeDomains: [selectedCandidate.officialDomain],
  });

  if (queries.length >= 10) {
    const duplicateCategoryIndex = queries.findIndex((query, index) =>
      queries.some(
        (other, otherIndex) =>
          otherIndex !== index && other.category === query.category,
      ),
    );
    if (duplicateCategoryIndex < 0) {
      throw new Error("Cannot add the official-domain query to the search plan.");
    }
    queries.splice(duplicateCategoryIndex, 1);
  }

  return SearchPlanSchema.parse({
    queries: [...queries, dedicatedDomainQuery],
  });
}
