import { search } from "@/lib/tavily";
import {
  SearchPlanSchema,
  SearchQueryCategorySchema,
  type SearchPlan,
  type SearchQueryCategory,
} from "@/lib/pipeline/plan";
import {
  CandidateSchema,
  SourceSchema,
  type Candidate,
  type Source,
  type SourceType,
} from "@/types";
import {
  getDateWindow,
  isBlocklistedDomain,
  isWithinDateRange,
  matchesDomain,
} from "@/lib/source-quality";
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
const MAX_BLOCKLISTED_SOURCES = 1;

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsFirm(source: Source, firmName: string): boolean {
  const phrase = firmName.trim().replace(/\s+/g, " ");
  if (!phrase) return false;
  const boundaryPattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(phrase)}($|[^\\p{L}\\p{N}])`,
    "iu",
  );
  return [source.title, source.snippet].some((text) =>
    boundaryPattern.test(text.replace(/\s+/g, " ")),
  );
}

export async function research(
  plan: SearchPlan,
  meetingAt: string,
  candidate: Candidate,
): Promise<ResearchResult> {
  const validatedPlan = SearchPlanSchema.parse(plan);
  const selectedCandidate = CandidateSchema.parse(candidate);
  const staleCutoff = getStaleCutoff(meetingAt);
  const dateWindow = getDateWindow(meetingAt);
  const results = await Promise.all(
    validatedPlan.queries.map(({ query, includeDomains }) =>
      search(query, { meetingAt, includeDomains }),
    ),
  );

  const byUrl = new Map<string, Source>();
  for (const source of results.flat()) {
    const url = normalizeUrl(source.url);
    if (byUrl.has(url)) continue;

    byUrl.set(url, SourceSchema.parse({ ...source, url }));
  }

  const mergedSources = [...byUrl.values()];
  const datedSources = mergedSources.flatMap((source) => {
    if (!source.publishedAt || source.publishedAt > dateWindow.endDate) {
      return [];
    }
    const withinWindow = isWithinDateRange(
      source.publishedAt,
      dateWindow.startDate,
      dateWindow.endDate,
    );
    const officialDomain = matchesDomain(
      source.domain,
      selectedCandidate.officialDomain,
    );
    if (!withinWindow && !officialDomain) return [];
    return [{ ...source, background: !withinWindow && officialDomain }];
  });
  const droppedByDateCount = mergedSources.length - datedSources.length;
  console.info(
    `Research date filter dropped ${droppedByDateCount} sources for ${selectedCandidate.name}.`,
  );

  const relevantSources = datedSources.filter(
    (source) =>
      matchesDomain(source.domain, selectedCandidate.officialDomain) ||
      mentionsFirm(source, selectedCandidate.name),
  );
  const droppedSourceCount = datedSources.length - relevantSources.length;
  console.info(
    `Research relevance filter dropped ${droppedSourceCount} sources for ${selectedCandidate.name}.`,
  );

  const relevantUrls = new Set(relevantSources.map((source) => source.url));
  const urlsByCategory = new Map<SearchQueryCategory, Set<string>>();
  validatedPlan.queries.forEach(({ category }, index) => {
    const categoryUrls = urlsByCategory.get(category) ?? new Set<string>();
    for (const source of results[index]) {
      const url = normalizeUrl(source.url);
      if (relevantUrls.has(url)) categoryUrls.add(url);
    }
    urlsByCategory.set(category, categoryUrls);
  });

  const orderedSources = relevantSources.sort((left, right) => {
    const blocklistOrder =
      Number(isBlocklistedDomain(left.domain)) -
      Number(isBlocklistedDomain(right.domain));
    if (blocklistOrder !== 0) return blocklistOrder;

    const priority = SourcePriority[left.sourceType] - SourcePriority[right.sourceType];
    if (priority !== 0) return priority;

    const dateOrder = (right.publishedAt ?? "").localeCompare(
      left.publishedAt ?? "",
    );
    if (dateOrder !== 0) return dateOrder;
    return left.url.localeCompare(right.url);
  });

  let blocklistedCount = 0;
  const sources = orderedSources
    .filter((source) => {
      if (!isBlocklistedDomain(source.domain)) return true;
      if (blocklistedCount >= MAX_BLOCKLISTED_SOURCES) return false;
      blocklistedCount += 1;
      return true;
    })
    .slice(0, 12)
    .map((source, index) => ({
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
