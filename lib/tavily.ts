import { tavily } from "@tavily/core";
import { SourceSchema, type Source, type SourceType } from "@/types";

type SearchOptions = {
  meetingAt: string;
  windowDays?: number;
};

const cache = new Map<string, Source[]>();

const newsDomains = new Set([
  "apnews.com",
  "axios.com",
  "bbc.com",
  "bloomberg.com",
  "cnbc.com",
  "cnn.com",
  "fortune.com",
  "ft.com",
  "theguardian.com",
  "nytimes.com",
  "reuters.com",
  "techcrunch.com",
  "theinformation.com",
  "wsj.com",
]);

const primaryPathPattern =
  /(?:^|\/)(?:blog|newsroom|press|press-release|press-releases|investor-relations)(?:\/|$)/i;

function isDomainOrSubdomain(domain: string, knownDomain: string): boolean {
  return domain === knownDomain || domain.endsWith(`.${knownDomain}`);
}

function classifySource(domain: string, url: URL): SourceType {
  if ([...newsDomains].some((knownDomain) => isDomainOrSubdomain(domain, knownDomain))) {
    return "news";
  }

  if (
    /^(?:blog|press|newsroom|investors?)\./i.test(domain) ||
    primaryPathPattern.test(url.pathname)
  ) {
    return "primary";
  }

  return "aggregator";
}

function toUtcDate(value: string): string | undefined {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getWindow(meetingAt: string, windowDays: number) {
  const meetingDate = toUtcDate(meetingAt);
  if (!meetingDate) {
    throw new Error("meetingAt must be a valid date.");
  }
  if (!Number.isInteger(windowDays) || windowDays < 0) {
    throw new Error("windowDays must be a non-negative integer.");
  }

  const end = new Date(`${meetingDate}T00:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - windowDays);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: meetingDate,
  };
}

function normalizeResults(
  results: Awaited<ReturnType<ReturnType<typeof tavily>["search"]>>["results"],
  startDate: string,
  endDate: string,
): Source[] {
  const seenUrls = new Set<string>();
  const sources: Source[] = [];

  for (const result of results) {
    const publishedAt = result.publishedDate
      ? toUtcDate(result.publishedDate)
      : undefined;
    if (!publishedAt || publishedAt < startDate || publishedAt > endDate) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(result.url);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";
    const normalizedUrl = url.toString();
    if (seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);

    const domain = url.hostname.toLowerCase().replace(/^www\./, "");
    const parsed = SourceSchema.safeParse({
      id: result.id || normalizedUrl,
      url: normalizedUrl,
      title: result.title,
      publishedAt,
      domain,
      sourceType: classifySource(domain, url),
      snippet: result.content,
    });

    if (parsed.success) sources.push(parsed.data);
  }

  return sources;
}

export async function search(
  query: string,
  { meetingAt, windowDays = 30 }: SearchOptions,
): Promise<Source[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("query must not be empty.");
  }

  const { startDate, endDate } = getWindow(meetingAt, windowDays);
  const cacheKey = JSON.stringify([normalizedQuery, startDate, endDate]);
  const cached = cache.get(cacheKey);
  if (cached) return cached.map((source) => ({ ...source }));

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not configured.");
  }

  const client = tavily({ apiKey });
  const response = await client.search(normalizedQuery, {
    maxResults: 8,
    startDate,
    endDate,
    includePublishedDate: true,
    filterByPublishedDate: true,
  });
  const sources = normalizeResults(response.results, startDate, endDate);
  cache.set(cacheKey, sources);
  return sources.map((source) => ({ ...source }));
}
