import { loadEnvConfig } from "@next/env";
import { search } from "../lib/tavily";

loadEnvConfig(process.cwd());

async function main() {
  const meetingAt = "2026-11-05T11:30:00+05:30";
  const results = await search("Peak XV Partners new investment", { meetingAt, windowDays: 30 });

  console.log(`Got ${results.length} results\n`);
  for (const r of results) {
    console.log(`${r.publishedAt} | ${r.sourceType} | ${r.domain}`);
    console.log(`  ${r.title}`);
    console.log(`  ${r.url}\n`);
  }
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });