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
  topic: z.literal("news").optional(),
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
          'Return valid JSON shaped as {"queries":[{"category":"firm_news","query":"..."}]}. Create 6 to 10 distinct, directly searchable queries and include every category exactly as spelled here: "firm_news", "new_investments", "partner_posts_interviews", "portfolio_news", "thesis_statements", "sector_competitors". Each query category must be exactly one of those six values; do not invent, rename, or abbreviate categories. Every query must quote the selected candidate full name exactly, whether it is a firm or an individual partner. Tailor queries to the selected investor and startup. For sector competitors, search for companies in the sector without asserting or inventing competitor names.',
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

  const queriesByCategory = new Map<SearchQueryCategory, string>();
  for (const { category, query } of data.queries) {
    if (!queriesByCategory.has(category)) {
      queriesByCategory.set(category, query);
    }
  }
  const queries = SearchQueryCategorySchema.options.map((category) => ({
    category,
    query: quoteFirmName(
      queriesByCategory.get(category)!,
      selectedCandidate.name,
    ),
  }));
  const targetedQueries = [
    SearchQuerySchema.parse({
      category: "firm_news",
      query: `"${selectedCandidate.name}" (launch OR launched OR hire OR hires OR hired OR departure OR departed OR announcement OR announced OR news)`,
      topic: "news",
    }),
    SearchQuerySchema.parse({
      category: "thesis_statements",
      query: `"${selectedCandidate.name}" "Requests for Startups" OR thesis OR "focus areas"`,
      includeDomains: [selectedCandidate.officialDomain],
    }),
    SearchQuerySchema.parse({
      category: "new_investments",
      query: `"${selectedCandidate.name}" announces investment OR portfolio OR batch ${input.startup.sector} news`,
      topic: "news",
    }),
    SearchQuerySchema.parse({
      category: "partner_posts_interviews",
      query: `"${selectedCandidate.name}" partner interview OR podcast OR post`,
    }),
  ];

  return SearchPlanSchema.parse({
    queries: [...queries, ...targetedQueries],
  });
}
