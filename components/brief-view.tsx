import type { FinalizedBrief } from "@/lib/pipeline/finalize";
import type { RunStats } from "@/types";

type Props = {
  candidateName: string;
  finalized: FinalizedBrief;
  stats: RunStats;
};

function Citation({
  factIds,
  finalized,
}: {
  factIds: string[];
  finalized: FinalizedBrief;
}) {
  const citedSourceNumbers = [
    ...new Set(
      factIds.flatMap(
        (factId) =>
          finalized.facts
            .find((fact) => fact.id === factId)
            ?.sourceIds.map(
              (sourceId) =>
                finalized.sources.find((source) => source.id === sourceId)
                  ?.number,
            ) ?? [],
      ),
    ),
  ].filter((number): number is number => number !== undefined);

  return (
    <span className="citation-list">
      {citedSourceNumbers.map((number) => (
        <a
          className="citation-chip"
          href={`#source-${number}`}
          key={number}
          aria-label={`Source ${number}`}
        >
          [{number}]
        </a>
      ))}
    </span>
  );
}

function CitedSentence({
  entry,
  finalized,
  showConfidence = false,
}: {
  entry: {
    text: string;
    factIds: string[];
    verificationStatus?: "partial";
    date?: string;
    backgroundDate?: string;
    contextField?: "sector" | "stage" | "raiseSize";
  };
  finalized: FinalizedBrief;
  showConfidence?: boolean;
}) {
  const supportingFacts = entry.factIds
    .map((factId) => finalized.facts.find((fact) => fact.id === factId))
    .filter((fact) => fact !== undefined);
  const isVerified =
    supportingFacts.length > 0 &&
    supportingFacts.every((fact) => fact.confidence === "Confirmed");

  return (
    <>
      {entry.date && <time className="timeline-date">{entry.date}</time>}
      <span>{entry.text}</span>
      <Citation factIds={entry.factIds} finalized={finalized} />
      {showConfidence && (
        <span className={`confidence-tag ${isVerified ? "verified" : "single-source"}`}>
          {isVerified ? "Verified" : "Single-source"}
        </span>
      )}
      {entry.verificationStatus === "partial" && (
        <span className="partial-badge">Partial</span>
      )}
      {entry.backgroundDate && (
        <span className="background-badge">
          Background · {entry.backgroundDate}
        </span>
      )}
    </>
  );
}

function truncateWords(text: string, maximum = 20): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maximum) return text.trim();
  return `${words.slice(0, maximum).join(" ").replace(/[.,;:!?]+$/, "")}…`;
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 2.5v9m0 0 3.5-3.5M10 11.5 6.5 8M3.5 14.5v2h13v-2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export default function BriefView({ candidateName, finalized, stats }: Props) {
  const { brief, sources, facts, gaps } = finalized;
  const briefFactIds = new Set([
    ...brief.atAGlance.flatMap((entry) => entry.factIds),
    ...brief.recentSignals.items.flatMap((entry) => entry.factIds),
    ...brief.fitWithStartup.reasons.flatMap((entry) => entry.factIds),
    ...brief.openQuestions.flatMap((entry) => entry.factIds),
  ]);
  const uncertainFacts = facts.filter(
    (fact) =>
      fact.confidence === "Single-source" && briefFactIds.has(fact.id),
  );
  const gapLines = [
    ...gaps.slice(0, 3).map((gap) => ({
      text: truncateWords(gap.description, 14),
      factIds: [],
    })),
    ...uncertainFacts.map((fact) => ({
      text: truncateWords(`Single-source: ${fact.claim}`, 14),
      factIds: [fact.id],
    })),
  ].slice(0, 3);

  return (
    <main className="workspace-main brief-workspace">
      <div className="page-heading brief-heading">
        <div>
          <p className="eyebrow">Investor brief</p>
          <h1>Meeting prep, with receipts.</h1>
          <p className="page-subtitle">
            {candidateName} · {facts.length} sourced facts · {sources.length} sources
          </p>
        </div>
        <button className="button button-secondary" onClick={() => window.print()}>
          <DownloadIcon />
          Print A4 brief
        </button>
      </div>

      <div className="brief-layout">
        <aside className="brief-rail">
          <section className="panel rail-panel">
            <p className="panel-label">RESEARCH SNAPSHOT</p>
            <h2>{candidateName}</h2>
            <div className="metric-row">
              <span>Sources</span>
              <strong>{sources.length}</strong>
            </div>
            <div className="metric-row">
              <span>Verified facts</span>
              <strong>{facts.length}</strong>
            </div>
            <div className="metric-row">
              <span>Topics to explore</span>
              <strong>{gaps.length}</strong>
            </div>
          </section>
          <section className="panel rail-panel stats-panel">
            <p className="panel-label">RUN STATS</p>
            <div className="metric-row">
              <span>Tokens</span>
              <strong>{stats.tokens.total.toLocaleString()}</strong>
            </div>
            <div className="metric-row">
              <span>Latency</span>
              <strong>{(stats.latencyMs / 1000).toFixed(1)}s</strong>
            </div>
          </section>
        </aside>

        <article className="brief-document">
          <div className="document-topline">
            <span>PITCHSIDE / FIELD NOTES</span>
            <span>PRIVATE · SOURCE-BACKED</span>
          </div>
          <h2 className="document-title">{candidateName}</h2>
          <p className="document-kicker">INVESTOR MEETING BRIEF</p>

          <section className="document-section">
            <h3>At a glance</h3>
            {brief.atAGlance.length ? (
              brief.atAGlance.slice(0, 2).map((entry, index) => (
                <p className="brief-sentence" key={`${entry.text}-${index}`}>
                  <CitedSentence entry={entry} finalized={finalized} />
                </p>
              ))
            ) : (
              <p className="empty-section">No concise background facts found in sources searched.</p>
            )}
          </section>

          <section className="document-section">
            <h3>Last 30 days</h3>
            {brief.recentSignals.items.length ? (
              <ul className="recent-signal-list">
                {brief.recentSignals.items.slice(0, 5).map((entry, index) => (
                  <li className="recent-signal" key={`${entry.date}-${index}`}>
                    <CitedSentence
                      entry={entry}
                      finalized={finalized}
                      showConfidence
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-section">No dated launches, hires, departures, announcements, or news found in-window.</p>
            )}
          </section>

          <section className="document-section">
            <h3>Fit with your startup</h3>
            <p className="fit-verdict">
              <strong>{brief.fitWithStartup.verdict}</strong>
            </p>
            {brief.fitWithStartup.reasons.length ? (
              <ul className="fit-reasons">
                {brief.fitWithStartup.reasons.slice(0, 2).map((reason, index) => (
                  <li key={`${reason.text}-${index}`}>
                    <span className="brief-sentence">
                      <CitedSentence entry={reason} finalized={finalized} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-section">Not enough sourced evidence to compare the submitted startup fields.</p>
            )}
          </section>

          <section className="document-section">
            <h3>Open questions</h3>
            <ol className="open-question-list">
              {brief.openQuestions.slice(0, 3).map((question, index) => (
                <li className="brief-sentence" key={`${question.text}-${index}`}>
                  <CitedSentence entry={question} finalized={finalized} />
                </li>
              ))}
            </ol>
          </section>

          <section className="document-section">
            <h3>Gaps and uncertain</h3>
            {gapLines.length ? (
              <ul className="gap-list">
                {gapLines.map((gap, index) => (
                  <li className="brief-sentence" key={`${gap.text}-${index}`}>
                    <CitedSentence entry={gap} finalized={finalized} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-section">No significant research gaps surfaced.</p>
            )}
          </section>

          <section className="document-section sources-section">
            <h3>Sources</h3>
            <ol className="print-source-list">
              {sources.map((source) => (
                <li id={`source-${source.number}`} key={source.id}>
                  <span className="source-number">{source.number}</span>
                  <span className="source-copy">
                    <strong>{truncateWords(source.title, 10)}</strong>
                    <span>
                      {source.domain}
                      {source.publishedAt ? ` · ${source.publishedAt}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </article>
      </div>
    </main>
  );
}
