import { search } from "@/lib/tavily";
import {
  SearchPlanSchema,
  SearchQueryCategorySchema,
  type SearchPlan,
  type SearchQueryCategory,
} from "@/lib/pipeline/plan";
import { SourceSchema, type Source, type SourceType } from "@/types";
import { z } from "zod";

export const ResearchResultSchema = z.object({
  sources: z.array(SourceSchema),
  stale: z.boolean(),
  sourceIdsByCategory: z.record(SearchQueryCategorySchema, z.array(z.string())),
});

export type ResearchResult = z.infer<typeof ResearchResultSchema>;

const SourcePriority: Record<SourceType, number> = {
  primary: 0,
  news: 1,
  aggregator: 2,
};

function normalizeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported source URL protocol: ${url.protocol}`);
  }
  url.hash = "";
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

function getStaleCutoff(meetingAt: string): number {
  const parsedMeetingAt = z.iso.datetime().safeParse(meetingAt);
  if (!parsedMeetingAt.success) {
    throw new Error("meetingAt must be a valid ISO datetime.");
  }

  return new Date(parsedMeetingAt.data).getTime() - 7 * 24 * 60 * 60 * 1000;
}

export async function research(
  plan: SearchPlan,
  meetingAt: string,
): Promise<ResearchResult> {
  const validatedPlan = SearchPlanSchema.parse(plan);
  const staleCutoff = getStaleCutoff(meetingAt);
  const results = await Promise.all(
    validatedPlan.queries.map(({ query }) => search(query, { meetingAt })),
  );

  const byUrl = new Map<string, Source>();
  const urlsByCategory = new Map<SearchQueryCategory, Set<string>>();
  validatedPlan.queries.forEach(({ category }, index) => {
    const categoryUrls = urlsByCategory.get(category) ?? new Set<string>();
    for (const source of results[index]) {
      categoryUrls.add(normalizeUrl(source.url));
    }
    urlsByCategory.set(category, categoryUrls);
  });

  for (const source of results.flat()) {
    const url = normalizeUrl(source.url);
    if (byUrl.has(url)) continue;

    byUrl.set(url, SourceSchema.parse({ ...source, url }));
  }

  const orderedSources = [...byUrl.values()].sort((left, right) => {
    const priority = SourcePriority[left.sourceType] - SourcePriority[right.sourceType];
    if (priority !== 0) return priority;

    const dateOrder = (right.publishedAt ?? "").localeCompare(
      left.publishedAt ?? "",
    );
    if (dateOrder !== 0) return dateOrder;
    return left.url.localeCompare(right.url);
  });

  const sources = orderedSources.slice(0, 12).map((source, index) => ({
    ...source,
    id: `S${index + 1}`,
  }));
  const idByUrl = new Map(sources.map((source) => [source.url, source.id]));
  const sourceIdsByCategory = Object.fromEntries(
    SearchQueryCategorySchema.options.map((category) => [
      category,
      [...(urlsByCategory.get(category) ?? [])]
        .map((url) => idByUrl.get(url))
        .filter((id): id is string => id !== undefined),
    ]),
  ) as Record<SearchQueryCategory, string[]>;
  const newestDate = sources.reduce<string | null>(
    (newest, source) =>
      source.publishedAt && (!newest || source.publishedAt > newest)
        ? source.publishedAt
        : newest,
    null,
  );

  return ResearchResultSchema.parse({
    sources,
    stale:
      newestDate === null ||
      new Date(`${newestDate}T00:00:00.000Z`).getTime() < staleCutoff,
    sourceIdsByCategory,
  });
}
