import { tavily } from "@tavily/core";
import { z } from "zod";
import { chatJson } from "@/lib/llm";
import { CandidateSchema } from "@/types";

const RequestSchema = z.object({
  investor: z.string().trim().min(1).max(200),
  entityType: z.enum(["firm", "person"]).default("firm"),
});

const ResultSchema = z.object({
  candidates: z.array(
    CandidateSchema.extend({
      evidenceUrls: z.array(z.string().url()).min(1),
    }).strip(),
  ).max(3),
});

function getDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsedRequest = RequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return Response.json(
      { error: "Provide an investor name." },
      { status: 400 },
    );
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "TAVILY_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const { investor, entityType } = parsedRequest.data;

  try {
    const client = tavily({ apiKey });
    const queries =
      entityType === "person"
        ? [
            `"${investor}" investor partner official profile`,
            `"${investor}" venture capital firm partner`,
          ]
        : [
            `"${investor}" official website`,
            `"${investor}" firm partners leadership`,
          ];
    const responses = await Promise.all(
      queries.map((query) => client.search(query, { maxResults: 8 })),
    );
    const resultsByUrl = new Map<
      string,
      { title: string; url: string; content: string; domain: string }
    >();

    for (const result of responses.flatMap((response) => response.results)) {
      const domain = getDomain(result.url);
      if (!domain || resultsByUrl.has(result.url)) continue;
      resultsByUrl.set(result.url, {
        title: result.title,
        url: result.url,
        content: result.content,
        domain,
      });
    }

    const results = [...resultsByUrl.values()];
    if (results.length === 0) {
      return Response.json({ candidates: [] });
    }

    const model = process.env.MODEL_CHEAP?.trim();
    if (!model) {
      return Response.json(
        { error: "MODEL_CHEAP is not configured." },
        { status: 500 },
      );
    }

    const { data } = await chatJson(
      model,
      [
        {
          role: "system",
          content:
            `Resolve the investor ${entityType === "person" ? "person" : "firm"} using only the supplied Tavily results. Return JSON shaped as {"candidates":[{"type":"firm","name":"...","officialDomain":"...","descriptor":"...","matchScore":0.0,"evidenceUrls":["https://..."]}]}, with at most three candidates. type must be exactly "firm", "partner", or "other". For a person, return type "partner" only when a supplied source supports that person's investor role and association with the firm domain. Never invent people, firms, official domains, descriptors, or evidence URLs. Use a candidate only when results support its identity. officialDomain must be the domain of a supplied result representing the candidate's official firm website or profile. Each candidate must cite one or more exact result URLs in evidenceUrls. Use an empty candidate array if results do not support a reliable match. matchScore must be a number from 0 to 1.`,
        },
        {
          role: "user",
          content: JSON.stringify({ investor, entityType, searchResults: results }),
        },
      ],
      ResultSchema,
    );

    const resultUrls = new Set(results.map((result) => result.url));
    const candidates = data.candidates
      .filter(
        (candidate) =>
          candidate.evidenceUrls.every((url) => resultUrls.has(url)) &&
          candidate.evidenceUrls.some(
            (url) => getDomain(url) === candidate.officialDomain.toLowerCase(),
          ),
      )
      .map(({ type, name, officialDomain, descriptor, matchScore }) => ({
        type,
        name,
        officialDomain,
        descriptor,
        matchScore,
      }));

    return Response.json({ candidates });
  } catch (error) {
    console.error("Investor resolution failed:", error);
    return Response.json(
      { error: "Investor resolution failed. Please try again." },
      { status: 502 },
    );
  }
}
