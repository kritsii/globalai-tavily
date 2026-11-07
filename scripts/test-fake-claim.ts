import { loadEnvConfig } from "@next/env";
import { createRunStats } from "../lib/llm";
import { verifyBrief } from "../lib/pipeline/verify";
import type { SynthesisBrief } from "../lib/pipeline/synthesize";

loadEnvConfig(process.cwd());

async function main() {
  const fakeClaim =
    "Peak XV invested $900 billion in an underwater moon hotel in 2026.";
  const brief = {
    atAGlance: [
      { text: fakeClaim, factIds: ["F1"] },
      { text: "Peak XV Partners is a venture capital firm.", factIds: ["F1"] },
    ],
    recentSignals: { items: [] },
    fitWithStartup: {
      verdict: "Not enough evidence",
      reasons: [
        { text: "The firm is a venture capital firm.", factIds: ["F1"] },
        { text: "Its focus needs further research.", factIds: ["F1"] },
      ],
    },
    openQuestions: [
      {
        text: "What evidence would demonstrate demand in climate tech?",
        factIds: [],
        contextField: "sector",
      },
      {
        text: "Which milestones matter most for a seed company?",
        factIds: [],
        contextField: "stage",
      },
      {
        text: "What milestones would best support a $2M raise?",
        factIds: [],
        contextField: "raiseSize",
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
      background: false,
    },
  ];
  const stats = createRunStats();

  const cleaned = await verifyBrief(
    brief,
    facts,
    sources,
    { officialDomain: "peakxv.com" },
    "2026-11-07T00:00:00.000Z",
    stats,
    {
      investor: "Peak XV Partners",
      meetingAt: "2026-11-07T00:00:00.000Z",
      meetingType: "Intro",
      startup: {
        oneLiner: "Climate software",
        sector: "climate tech",
        stage: "seed",
        raiseSize: "$2M",
      },
    },
  );
  const fakeClaimWasDropped = stats.droppedClaims.some(
    ({ text }) => text === fakeClaim,
  );
  console.log(
    JSON.stringify(
      {
        fakeClaimWasDropped,
        droppedClaims: stats.droppedClaims,
        cleanedAtAGlance: cleaned.atAGlance,
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
