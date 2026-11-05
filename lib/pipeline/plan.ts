import { z } from "zod";
import { chatJson } from "@/lib/llm";
import {
  BriefInputSchema,
  CandidateSchema,
  type BriefInput,
  type Candidate,
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

export async function planSearchQueries(
  candidate: Candidate,
  briefInput: BriefInput,
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
          "Create a JSON search plan with 6 to 10 distinct web search queries, each labeled with a category. Include at least one query for every category: firm_news, new_investments, partner_posts_interviews, portfolio_news, thesis_statements, and sector_competitors. Tailor queries to the selected investor and startup. Search for competitor companies in the startup's sector without asserting or inventing competitor names. Return concise, directly searchable queries.",
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
  );

  return data;
}
