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
}: {
  entry: {
    text: string;
    factIds: string[];
    verificationStatus?: "partial";
    date?: string;
  };
  finalized: FinalizedBrief;
}) {
  return (
    <p className="brief-sentence">
      {entry.date && <time className="timeline-date">{entry.date}</time>}
      <span>{entry.text}</span>
      {entry.verificationStatus === "partial" && (
        <span className="partial-badge">Partial</span>
      )}
      <Citation factIds={entry.factIds} finalized={finalized} />
    </p>
  );
}

function BriefSection({
  title,
  entries,
  finalized,
  emptyText,
}: {
  title: string;
  entries: Array<{
    text: string;
    factIds: string[];
    verificationStatus?: "partial";
    date?: string;
  }>;
  finalized: FinalizedBrief;
  emptyText?: string;
}) {
  if (entries.length === 0 && !emptyText) return null;

  return (
    <section className="document-section">
      <h3>{title}</h3>
      {entries.length ? (
        entries.map((entry, index) => (
          <CitedSentence
            entry={entry}
            finalized={finalized}
            key={`${title}-${entry.date ?? index}-${entry.text}`}
          />
        ))
      ) : (
        <p className="empty-section">{emptyText}</p>
      )}
    </section>
  );
}

export default function BriefView({ candidateName, finalized, stats }: Props) {
  const { brief, sources, facts, gaps, stalenessWarning } = finalized;

  return (
    <main className="workspace-main brief-workspace">
      <div className="page-heading brief-heading">
        <div>
          <p className="eyebrow">Investor brief</p>
          <h1>Meeting prep, with receipts.</h1>
          <p className="page-subtitle">
            Research on {candidateName} · {facts.length} sourced facts
          </p>
        </div>
        <button className="button button-secondary" onClick={() => window.print()}>
          <DownloadIcon />
          Export brief
        </button>
      </div>

      {stalenessWarning && (
        <div className="warning-banner" role="status">
          <span aria-hidden="true">◷</span>
          {stalenessWarning}
        </div>
      )}

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
            <div className="confidence-legend">
              <span className="confidence-dot confirmed" />
              Confirmed · 2+ domains
              <span className="confidence-dot single" />
              Single source
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
            <div className="metric-row">
              <span>Fallbacks</span>
              <strong>{stats.fallbacks}</strong>
            </div>
          </section>

          {gaps.length > 0 && (
            <section className="panel rail-panel gap-panel">
              <p className="panel-label">RESEARCH GAPS</p>
              {gaps.map((gap) => (
                <p className="gap-item" key={gap.topic}>
                  <span aria-hidden="true">↗</span>
                  {gap.topic} not found in sources searched
                </p>
              ))}
            </section>
          )}
        </aside>

        <article className="brief-document">
          <div className="document-topline">
            <span>PITCHSIDE / FIELD NOTES</span>
            <span>PRIVATE &middot; SOURCE-BACKED</span>
          </div>
          <h2 className="document-title">{candidateName}</h2>
          <p className="document-kicker">INVESTOR MEETING BRIEF</p>

          <BriefSection
            title="At a glance"
            entries={brief.summary}
            finalized={finalized}
          />
          <BriefSection
            title="Recent activity"
            entries={brief.timeline}
            finalized={finalized}
            emptyText="No dated updates found in the sources searched."
          />
          <BriefSection
            title="New investments"
            entries={brief.recentInvestments}
            finalized={finalized}
            emptyText="No investment announcements found in the sources searched."
          />
          <BriefSection
            title="Thesis signals"
            entries={brief.thesisDrift}
            finalized={finalized}
            emptyText="No evidence-backed thesis changes found."
          />
          <BriefSection
            title="Portfolio & fit"
            entries={brief.portfolioConflicts}
            finalized={finalized}
            emptyText="No sourced portfolio conflicts identified."
          />
          <BriefSection
            title="Conversation starters"
            entries={brief.conversationStarters}
            finalized={finalized}
          />
        </article>

        <aside className="brief-rail source-rail">
          <section className="panel rail-panel sources-panel">
            <div className="source-heading">
              <p className="panel-label">SOURCES</p>
              <span className="source-count">{sources.length}</span>
            </div>
            <ol className="source-list">
              {sources.map((source) => (
                <li id={`source-${source.number}`} key={source.id}>
                  <a
                    className="source-link"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="source-number">{source.number}</span>
                    <span className="source-copy">
                      <strong>{source.title}</strong>
                      <span>
                        {source.domain}
                        {source.publishedAt ? ` · ${source.publishedAt}` : ""}
                      </span>
                    </span>
                    <ExternalIcon />
                  </a>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
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

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3.5h6.5V10M12 4 6.5 9.5M11 9.5v3h-7v-7h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}
