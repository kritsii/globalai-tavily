import { tavily } from "@tavily/core";
import { z } from "zod";
import { chatJson } from "@/lib/llm";
import { CandidateSchema } from "@/types";

const RequestSchema = z.object({
  investor: z.string().trim().min(1).max(200),
});

const ResultSchema = z.object({
  candidates: z.array(
    CandidateSchema.extend({
      evidenceUrls: z.array(z.string().url()).min(1),
    }),
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

  const investor = parsedRequest.data.investor;

  try {
    const client = tavily({ apiKey });
    const queries = [
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
            "Resolve the investor name using only the supplied Tavily search results. Return valid JSON containing at most three distinct candidates. Never invent people, firms, official domains, or descriptors. Use a candidate only when the results support its identity. officialDomain must be the domain of a supplied result that represents the candidate's official website. Each candidate must cite one or more exact result URLs in evidenceUrls. Use an empty candidate array if the results do not support a reliable match. matchScore is a confidence score from 0 to 1.",
        },
        {
          role: "user",
          content: JSON.stringify({ investor, searchResults: results }),
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
