import { search } from "@/lib/tavily";
import { SearchPlanSchema, type SearchPlan } from "@/lib/pipeline/plan";
import { SourceSchema, type Source, type SourceType } from "@/types";
import { z } from "zod";

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
): Promise<{ sources: Source[]; stale: boolean }> {
  const validatedPlan = SearchPlanSchema.parse(plan);
  const staleCutoff = getStaleCutoff(meetingAt);
  const results = await Promise.all(
    validatedPlan.queries.map(({ query }) => search(query, { meetingAt })),
  );

  const byUrl = new Map<string, Source>();
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

  const sources = orderedSources.map((source, index) => ({
    ...source,
    id: `S${index + 1}`,
  }));
  const newestDate = sources.reduce<string | null>(
    (newest, source) =>
      source.publishedAt && (!newest || source.publishedAt > newest)
        ? source.publishedAt
        : newest,
    null,
  );

  return {
    sources,
    stale:
      newestDate === null ||
      new Date(`${newestDate}T00:00:00.000Z`).getTime() < staleCutoff,
  };
}
