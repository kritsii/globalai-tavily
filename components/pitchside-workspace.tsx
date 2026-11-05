"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import BriefView from "@/components/brief-view";
import type { FinalizedBrief } from "@/lib/pipeline/finalize";
import {
  BriefInputSchema,
  CandidateSchema,
  FactSchema,
  GapSchema,
  RunStatsSchema,
  SourceSchema,
  type BriefInput,
  type Candidate,
  type RunStats,
} from "@/types";

const CitedSentenceSchema = z.object({
  text: z.string().min(1),
  factIds: z.array(z.string().min(1)),
  verificationStatus: z.literal("partial").optional(),
});

const ClientFinalizedBriefSchema = z.object({
  brief: z.object({
    summary: z.array(CitedSentenceSchema),
    timeline: z.array(CitedSentenceSchema.extend({ date: z.string() })),
    recentInvestments: z.array(CitedSentenceSchema),
    thesisDrift: z.array(CitedSentenceSchema),
    portfolioConflicts: z.array(CitedSentenceSchema),
    conversationStarters: z.array(CitedSentenceSchema),
  }),
  facts: z.array(
    FactSchema.extend({
      confidence: z.enum(["Confirmed", "Single-source"]),
    }),
  ),
  gaps: z.array(GapSchema),
  stalenessWarning: z.string().nullable(),
  sources: z.array(
    SourceSchema.extend({ number: z.number().int().positive() }),
  ),
});

const ResolveResponseSchema = z.object({
  candidates: z.array(CandidateSchema),
});

const CompleteEventSchema = z.object({
  brief: ClientFinalizedBriefSchema,
  stats: RunStatsSchema,
});

const emptyStats: RunStats = {
  models: [],
  tokens: { input: 0, output: 0, total: 0 },
  costEstimate: null,
  latencyMs: 0,
  fallbacks: 0,
  cacheHits: 0,
  droppedClaims: [],
};

type Screen = "new" | "matches" | "brief" | "library";
type LibraryItem = {
  id: string;
  candidate: Candidate;
  finalized: FinalizedBrief;
  stats: RunStats;
  createdAt: string;
};

export default function PitchsideWorkspace() {
  const [screen, setScreen] = useState<Screen>("new");
  const [form, setForm] = useState({
    investor: "",
    meetingAt: "",
    meetingType: "Intro",
    oneLiner: "",
    sector: "",
    stage: "",
    raiseSize: "",
  });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(
    null,
  );
  const [finalized, setFinalized] = useState<FinalizedBrief | null>(null);
  const [stats, setStats] = useState<RunStats>(emptyStats);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState("");
  const [pipelineStage, setPipelineStage] = useState("");
  const [sourceCount, setSourceCount] = useState<number | null>(null);
  const [factCount, setFactCount] = useState<number | null>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("pitchside-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      document.documentElement.dataset.theme = savedTheme;
    }
  }, []);

  const currentLibraryItem = library.find(
    (item) => item.id === activeLibraryId,
  );
  const shownCandidate = currentLibraryItem?.candidate ?? selectedCandidate;
  const shownBrief = currentLibraryItem?.finalized ?? finalized;
  const shownStats = currentLibraryItem?.stats ?? stats;

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetToNewBrief() {
    setScreen("new");
    setError("");
    setPipelineStage("");
    setSourceCount(null);
    setFactCount(null);
    setSelectedCandidate(null);
    setCandidates([]);
    setFinalized(null);
    setActiveLibraryId(null);
    setStats(emptyStats);
  }

  async function findMatches(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    setCandidates([]);
    setSelectedCandidate(null);
    setFinalized(null);

    try {
      if (!form.meetingAt) throw new Error("Choose a meeting date and time.");
      const requestInput: BriefInput = BriefInputSchema.parse({
        investor: form.investor,
        meetingAt: new Date(form.meetingAt).toISOString(),
        meetingType: form.meetingType,
        startup: {
          oneLiner: form.oneLiner,
          sector: form.sector,
          stage: form.stage,
          raiseSize: form.raiseSize,
        },
      });

      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investor: requestInput.investor }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Could not search for investor matches.";
        throw new Error(message);
      }

      const parsed = ResolveResponseSchema.parse(body);
      setCandidates(parsed.candidates);
      setScreen("matches");
    } catch (caughtError) {
      setError(
        caughtError instanceof z.ZodError
          ? "Fill in each meeting and startup field to continue."
          : caughtError instanceof Error
            ? caughtError.message
            : "Could not search for investor matches.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function generateBrief() {
    if (!selectedCandidate) {
      setError("Choose an investor match first.");
      return;
    }
    setError("");
    setLoading(true);
    setStats(emptyStats);
    setPipelineStage("plan");
    setSourceCount(null);
    setFactCount(null);

    try {
      const requestInput = BriefInputSchema.parse({
        investor: form.investor,
        meetingAt: new Date(form.meetingAt).toISOString(),
        meetingType: form.meetingType,
        startup: {
          oneLiner: form.oneLiner,
          sector: form.sector,
          stage: form.stage,
          raiseSize: form.raiseSize,
        },
      });
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: selectedCandidate,
          briefInput: requestInput,
        }),
      });
      if (!response.ok || !response.body) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Could not start brief generation.";
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let complete = false;
      let streamError: string | undefined;

      const handleFrame = (frame: string) => {
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) return;

        const data: unknown = JSON.parse(dataLines.join("\n"));
        if (eventName === "progress" && typeof data === "object" && data) {
          if ("stage" in data && typeof data.stage === "string") {
            setPipelineStage(data.stage);
          }
          if ("sourceCount" in data && typeof data.sourceCount === "number") {
            setSourceCount(data.sourceCount);
          }
          if ("factCount" in data && typeof data.factCount === "number") {
            setFactCount(data.factCount);
          }
        }
        if (eventName === "error") {
          streamError =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "string"
              ? data.error
              : "Brief generation failed.";
        }
        if (eventName === "complete") {
          const result = CompleteEventSchema.parse(data);
          complete = true;
          setFinalized(result.brief);
          setStats(result.stats);
          setScreen("brief");
          setActiveLibraryId(null);
          setLibrary((items) => [
            {
              id: crypto.randomUUID(),
              candidate: selectedCandidate,
              finalized: result.brief,
              stats: result.stats,
              createdAt: new Date().toISOString(),
            },
            ...items,
          ]);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        frames.forEach(handleFrame);
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleFrame(buffer);
      if (streamError) throw new Error(streamError);
      if (!complete) throw new Error("The brief stream ended before completion.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Brief generation failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  function openLibraryItem(item: LibraryItem) {
    setActiveLibraryId(item.id);
    setSelectedCandidate(item.candidate);
    setFinalized(item.finalized);
    setStats(item.stats);
    setScreen("brief");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={resetToNewBrief} type="button">
          <span className="brand__mark" aria-hidden="true">
            <BrandIcon />
          </span>
          <span>pitchside</span>
          <span className="brand__beta">FIELDNOTES</span>
        </button>
        <nav className="app-nav" aria-label="Main navigation">
          <button
            className={screen !== "library" ? "active" : ""}
            onClick={resetToNewBrief}
            type="button"
          >
            New brief
          </button>
          <button
            className={screen === "library" ? "active" : ""}
            onClick={() => {
              setError("");
              setScreen("library");
            }}
            type="button"
          >
            Library
            {library.length > 0 && <span className="nav-count">{library.length}</span>}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            type="button"
          >
            Settings
          </button>
        </nav>
        <div className="header-tools">
          <span className="tavily-badge">
            <span className="tavily-badge__dot" />
            Search by Tavily
          </span>
          <button
            aria-label="Toggle light and dark theme"
            className="theme-toggle"
            onClick={toggleTheme}
            title="Toggle theme"
            type="button"
          >
            <ThemeIcon />
          </button>
        </div>
      </header>

      {screen === "new" && (
        <NewBriefScreen
          error={error}
          form={form}
          loading={loading}
          onSubmit={findMatches}
          updateForm={updateForm}
        />
      )}

      {screen === "matches" && (
        <MatchScreen
          candidates={candidates}
          error={error}
          loading={loading}
          onBack={() => setScreen("new")}
          onGenerate={generateBrief}
          onSelect={setSelectedCandidate}
          selectedCandidate={selectedCandidate}
        />
      )}

      {screen === "brief" && shownBrief && shownCandidate && (
        <BriefView
          candidateName={shownCandidate.name}
          finalized={shownBrief}
          stats={shownStats}
        />
      )}

      {screen === "library" && (
        <LibraryScreen
          items={library}
          onNewBrief={resetToNewBrief}
          onOpen={openLibraryItem}
        />
      )}

      {loading && screen !== "new" && screen !== "matches" && (
        <div className="loading-indicator" role="status">
          <span className="loading-spinner" />
          Preparing your sourced brief…
        </div>
      )}
      {loading && screen === "matches" && (
        <div className="loading-overlay" role="status">
          <span className="loading-spinner" />
          <span>Building your investor brief</span>
          <span className="loading-stage">
            {pipelineStage || "Starting"} {sourceCount !== null && `· ${sourceCount} sources`}
            {factCount !== null && ` · ${factCount} facts`}
          </span>
        </div>
      )}

      {settingsOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setSettingsOpen(false)}
          role="presentation"
        >
          <section
            aria-labelledby="settings-heading"
            aria-modal="true"
            className="settings-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button
              aria-label="Close settings"
              className="modal-close"
              onClick={() => setSettingsOpen(false)}
              type="button"
            >
              ×
            </button>
            <p className="eyebrow">Workspace settings</p>
            <h2 id="settings-heading">Configuration</h2>
            <p>
              API credentials, model names, and the per-brief token cap are
              managed securely through your local environment settings.
            </p>
            <div className="settings-list">
              <span>Research provider</span>
              <strong>Search by Tavily</strong>
              <span>Theme preference</span>
              <strong>System default, with manual override</strong>
              <span>Brief budget</span>
              <strong>Configured by workspace environment</strong>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

type FormFields = {
  investor: string;
  meetingAt: string;
  meetingType: string;
  oneLiner: string;
  sector: string;
  stage: string;
  raiseSize: string;
};

function NewBriefScreen({
  error,
  form,
  loading,
  onSubmit,
  updateForm,
}: {
  error: string;
  form: FormFields;
  loading: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  updateForm: (field: keyof FormFields, value: string) => void;
}) {
  return (
    <main className="workspace-main">
      <StepProgress step={1} />
      <div className="page-heading">
        <div>
          <p className="eyebrow">Start with the room</p>
          <h1>Who are you meeting?</h1>
          <p className="page-subtitle">
            A little context helps us find the right investor and the right
            research.
          </p>
        </div>
        <span className="secure-label">
          <LockIcon />
          Private workspace
        </span>
      </div>

      <div className="new-brief-layout">
        <form className="panel brief-form" onSubmit={onSubmit}>
          <div className="form-section">
            <div className="form-section-heading">
              <span className="section-index">01</span>
              <div>
                <h2>The meeting</h2>
                <p>Who is on the other side of the table?</p>
              </div>
            </div>
            <label className="field">
              <span>Investor, firm, or partner</span>
              <input
                autoComplete="organization"
                onChange={(event) => updateForm("investor", event.target.value)}
                placeholder="e.g. Northstar Ventures"
                required
                value={form.investor}
              />
            </label>
            <div className="field-grid">
              <label className="field">
                <span>Date &amp; time</span>
                <input
                  onChange={(event) => updateForm("meetingAt", event.target.value)}
                  required
                  type="datetime-local"
                  value={form.meetingAt.slice(0, 16)}
                />
              </label>
              <label className="field">
                <span>Meeting type</span>
                <select
                  onChange={(event) => updateForm("meetingType", event.target.value)}
                  value={form.meetingType}
                >
                  <option>Intro</option>
                  <option>Partner meeting</option>
                  <option>Follow-up</option>
                  <option>Pitch</option>
                </select>
              </label>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <span className="section-index">02</span>
              <div>
                <h2>Your startup</h2>
                <p>We use this only to make the brief relevant to you.</p>
              </div>
            </div>
            <label className="field">
              <span>One-line description</span>
              <input
                onChange={(event) => updateForm("oneLiner", event.target.value)}
                placeholder="What are you building?"
                required
                value={form.oneLiner}
              />
            </label>
            <div className="field-grid">
              <label className="field">
                <span>Sector</span>
                <input
                  onChange={(event) => updateForm("sector", event.target.value)}
                  placeholder="e.g. Climate tech"
                  required
                  value={form.sector}
                />
              </label>
              <label className="field">
                <span>Stage</span>
                <select
                  onChange={(event) => updateForm("stage", event.target.value)}
                  required
                  value={form.stage}
                >
                  <option disabled value="">
                    Select stage
                  </option>
                  <option>Pre-seed</option>
                  <option>Seed</option>
                  <option>Series A</option>
                  <option>Series B+</option>
                  <option>Bootstrapped</option>
                </select>
              </label>
            </div>
            <label className="field field-compact">
              <span>Raise size</span>
              <input
                onChange={(event) => updateForm("raiseSize", event.target.value)}
                placeholder="e.g. $2M"
                required
                value={form.raiseSize}
              />
            </label>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary submit-button" disabled={loading}>
            {loading ? (
              <>
                <span className="button-spinner" />
                Searching…
              </>
            ) : (
              <>
                Find the right match
                <ArrowIcon />
              </>
            )}
          </button>
        </form>

        <aside className="new-brief-aside">
          <section className="panel aside-panel">
            <p className="panel-label">YOUR BRIEF, BUILT</p>
            <div className="mini-step">
              <span className="mini-step-number">01</span>
              <span>
                <strong>Find the match</strong>
                <small>Verify the investor from search results</small>
              </span>
              <CheckIcon />
            </div>
            <div className="mini-step">
              <span className="mini-step-number">02</span>
              <span>
                <strong>Gather the signal</strong>
                <small>Search news, investments, and portfolio</small>
              </span>
              <SearchIcon />
            </div>
            <div className="mini-step">
              <span className="mini-step-number">03</span>
              <span>
                <strong>Build your brief</strong>
                <small>Every claim linked back to a source</small>
              </span>
              <DocumentIcon />
            </div>
          </section>
          <section className="note-card">
            <span className="note-icon"><SparkIcon /></span>
            <p>
              <strong>Evidence, not guesswork.</strong>
              <span>
                We only include claims that can be traced to retrieved sources.
              </span>
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function MatchScreen({
  candidates,
  error,
  loading,
  onBack,
  onGenerate,
  onSelect,
  selectedCandidate,
}: {
  candidates: Candidate[];
  error: string;
  loading: boolean;
  onBack: () => void;
  onGenerate: () => void;
  onSelect: (candidate: Candidate) => void;
  selectedCandidate: Candidate | null;
}) {
  return (
    <main className="workspace-main">
      <StepProgress step={2} />
      <div className="page-heading">
        <div>
          <p className="eyebrow">A quick identity check</p>
          <h1>Pick the right match for “{candidates[0]?.name ?? "your investor"}”</h1>
          <p className="page-subtitle">
            We found these possibilities in search. Choose the one you’re meeting.
          </p>
        </div>
        <button className="button button-secondary" onClick={onBack} type="button">
          Edit details
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {candidates.length === 0 ? (
        <section className="panel no-match-panel">
          <span className="empty-icon"><SearchIcon /></span>
          <h2>No confident matches found</h2>
          <p>
            Try a more specific firm or partner name. We won’t guess when search
            results don’t support a match.
          </p>
          <button className="button button-secondary" onClick={onBack} type="button">
            Update search
          </button>
        </section>
      ) : (
        <>
          <div className="candidate-grid">
            {candidates.map((candidate, index) => {
              const isSelected = selectedCandidate?.name === candidate.name &&
                selectedCandidate.officialDomain === candidate.officialDomain;
              return (
                <button
                  aria-pressed={isSelected}
                  className={`panel candidate-card ${isSelected ? "selected" : ""}`}
                  key={`${candidate.name}-${candidate.officialDomain}`}
                  onClick={() => onSelect(candidate)}
                  type="button"
                >
                  <div className="candidate-card-top">
                    <span className="candidate-avatar">
                      {candidate.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="radio-indicator">
                      {isSelected && <span />}
                    </span>
                  </div>
                  <span className="candidate-type">
                    {candidate.type} match {index + 1}
                  </span>
                  <strong className="candidate-name">{candidate.name}</strong>
                  <span className="candidate-domain">{candidate.officialDomain}</span>
                  <span className="candidate-description">{candidate.descriptor}</span>
                  <span className="candidate-score">
                    <span className="score-track">
                      <span style={{ width: `${candidate.matchScore * 100}%` }} />
                    </span>
                    {Math.round(candidate.matchScore * 100)}% match
                  </span>
                </button>
              );
            })}
          </div>
          <div className="match-actions">
            <p>
              <ShieldIcon />
              Match details are grounded in retrieved search results.
            </p>
            <button
              className="button button-primary"
              disabled={!selectedCandidate || loading}
              onClick={onGenerate}
              type="button"
            >
              Build my brief
              <ArrowIcon />
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function LibraryScreen({
  items,
  onNewBrief,
  onOpen,
}: {
  items: LibraryItem[];
  onNewBrief: () => void;
  onOpen: (item: LibraryItem) => void;
}) {
  return (
    <main className="workspace-main library-screen">
      <StepProgress step={4} />
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1>Your pipeline</h1>
          <p className="page-subtitle">
            Briefs from this session, ready when you are.
          </p>
        </div>
        <button className="button button-primary" onClick={onNewBrief} type="button">
          <span>+</span>
          New brief
        </button>
      </div>

      {items.length > 0 ? (
        <div className="library-layout">
          <section className="library-list">
            <p className="panel-label">RECENT BRIEFS · {items.length}</p>
            {items.map((item) => (
              <button
                className="panel library-item"
                key={item.id}
                onClick={() => onOpen(item)}
                type="button"
              >
                <span className="library-avatar">
                  {item.candidate.name.slice(0, 1)}
                </span>
                <span className="library-item-copy">
                  <strong>{item.candidate.name}</strong>
                  <small>
                    {item.finalized.facts.length} facts · {item.finalized.sources.length} sources
                  </small>
                </span>
                <span className="library-date">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
                <ArrowIcon />
              </button>
            ))}
          </section>
          <aside className="panel library-summary">
            <p className="panel-label">WORKSPACE</p>
            <div className="metric-row">
              <span>Briefs created</span>
              <strong>{items.length}</strong>
            </div>
            <div className="metric-row">
              <span>Sources reviewed</span>
              <strong>
                {items.reduce((total, item) => total + item.finalized.sources.length, 0)}
              </strong>
            </div>
            <p className="library-retention">
              Briefs are held in this browser session and are cleared when you
              close it.
            </p>
          </aside>
        </div>
      ) : (
        <section className="panel library-empty">
          <span className="empty-icon"><LibraryIcon /></span>
          <h2>Your research, all in one place.</h2>
          <p>
            Investor briefs you create in this session will show up here with
            their sources and key takeaways.
          </p>
          <button className="button button-primary" onClick={onNewBrief} type="button">
            Create your first brief
            <ArrowIcon />
          </button>
        </section>
      )}
    </main>
  );
}

function StepProgress({ step }: { step: number }) {
  const labels = ["New brief", "Pick match", "Build brief", "Library"];
  return (
    <div className="step-progress" aria-label={`Step ${step} of 4`}>
      {labels.map((label, index) => (
        <span
          className={`step-item ${index + 1 === step ? "current" : ""} ${index + 1 < step ? "done" : ""}`}
          key={label}
        >
          <span className="step-dot">
            {index + 1 < step ? <CheckIcon /> : index + 1}
          </span>
          {label}
          {index < labels.length - 1 && <span className="step-line" />}
        </span>
      ))}
    </div>
  );
}

function toggleTheme() {
  const root = document.documentElement;
  const currentTheme =
    root.dataset.theme ??
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  root.dataset.theme = currentTheme === "dark" ? "light" : "dark";
  window.localStorage.setItem("pitchside-theme", root.dataset.theme);
}

function BrandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 18V6h5.5a3 3 0 0 1 0 6H5m7 6 4-6m0 0 3 6m-3-6h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3.5 10h12m0 0-4.5-4.5m4.5 4.5-4.5 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="8.75" cy="8.75" r="5.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13 13 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 2.75h6l4 4v10.5H5V2.75Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
      <path d="M11 3v4h4m-7 4h4m-4 3h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m10 2 1.7 5.3L17 9l-5.3 1.7L10 16l-1.7-5.3L3 9l5.3-1.7L10 2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
      <path d="m16 13 .8 2.2L19 16l-2.2.8L16 19l-.8-2.2L13 16l2.2-.8L16 13Z" fill="currentColor" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2 15 4v4.5c0 3.5-2.4 6-6 7.5-3.6-1.5-6-4-6-7.5V4l6-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.3" />
      <path d="m6.5 8.5 1.7 1.7 3.4-3.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H20v15H5.5A1.5 1.5 0 0 0 4 20.5v-15Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 17.5A1.5 1.5 0 0 1 5.5 16H20M8 8h8m-8 4h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}
