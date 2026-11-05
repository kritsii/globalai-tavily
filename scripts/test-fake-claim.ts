import { loadEnvConfig } from "@next/env";
import { createRunStats } from "../lib/llm";
import { verifyBrief } from "../lib/pipeline/verify";
import type { SynthesisBrief } from "../lib/pipeline/synthesize";

loadEnvConfig(process.cwd());

async function main() {
  const fakeClaim =
    "Peak XV invested $900 billion in an underwater moon hotel in 2026.";
  const brief = {
    summary: [
      { text: fakeClaim, factIds: ["F1"] },
      { text: "Peak XV Partners is a venture capital firm.", factIds: ["F1"] },
    ],
    timeline: [],
    recentInvestments: [],
    thesisDrift: [],
    portfolioConflicts: [],
    conversationStarters: [
      {
        text: "What investment themes are most important to the firm?",
        factIds: ["F1"],
      },
      {
        text: "How does the firm evaluate new opportunities?",
        factIds: ["F1"],
      },
      {
        text: "What makes a company a good fit for the firm?",
        factIds: ["F1"],
      },
    ],
  } satisfies SynthesisBrief;
  const facts = [
    {
      id: "F1",
      claim: "Peak XV Partners is a venture capital firm.",
      sourceIds: ["S1"],
      date: null,
    },
  ];
  const sources = [
    {
      id: "S1",
      url: "https://example.com/about",
      title: "About",
      publishedAt: null,
      domain: "example.com",
      sourceType: "primary" as const,
      snippet: "Peak XV Partners is a venture capital firm.",
    },
  ];
  const stats = createRunStats();

  const cleaned = await verifyBrief(brief, facts, sources, stats);
  const fakeClaimWasDropped = stats.droppedClaims.some(
    ({ text }) => text === fakeClaim,
  );
  console.log(
    JSON.stringify(
      {
        fakeClaimWasDropped,
        droppedClaims: stats.droppedClaims,
        cleanedSummary: cleaned.summary,
      },
      null,
      2,
    ),
  );

  if (!fakeClaimWasDropped) {
    throw new Error("Expected the unsupported fake claim to be dropped.");
  }
}

main().catch((error: unknown) => {
  console.error("Fake-claim test failed:");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
