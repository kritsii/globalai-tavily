import Link from "next/link";
import { SampleBriefPreview } from "@/components/demo-brief";
import SiteHeader from "@/components/site-header";

export default function LandingPage() {
  return (
    <div className="landing-page">
      <SiteHeader />
      <main>
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <p className="eyebrow">Research-backed meeting prep</p>
            <h1>Walk into investor meetings with research you can trace.</h1>
            <p className="landing-hero__subhead">
              Build a focused investor brief from professional public
              information, with claims connected to their sources and gaps left
              honestly visible.
            </p>
            <div className="landing-actions">
              <Link className="button button-primary landing-cta" href="/new">
                Create a brief <ArrowIcon />
              </Link>
              <Link className="button button-secondary landing-cta" href="/demo">
                See a sample brief
              </Link>
            </div>
            <p className="landing-hero__note">
              No unsupported claims presented as fact.
            </p>
          </div>
          <div className="landing-hero__visual" aria-hidden="true">
            <span className="hero-orbit hero-orbit--one" />
            <span className="hero-orbit hero-orbit--two" />
            <div className="hero-note-card">
              <span className="hero-note-card__label">MEETING PREP</span>
              <strong>
                Know what to ask.
                <br />
                Know where it came from.
              </strong>
              <span className="hero-note-card__citation">
                <span>01</span> Source-linked research
              </span>
            </div>
          </div>
        </section>

        <section className="landing-section sample-section" id="sample">
          <div className="landing-section__heading">
            <p className="eyebrow">A brief, at a glance</p>
            <h2>Every useful signal comes with a trail.</h2>
            <p>
              The preview below uses seeded sample content and public source
              links. It is not a live research result.
            </p>
          </div>
          <SampleBriefPreview />
          <Link className="text-link" href="/demo">
            Explore the sample brief <ArrowIcon />
          </Link>
        </section>

        <section className="landing-section how-section">
          <div className="landing-section__heading">
            <p className="eyebrow">How it works</p>
            <h2>A clear path from meeting details to a useful brief.</h2>
          </div>
          <ol className="how-grid">
            {[
              ["01", "Add your context", "Share the investor, meeting, and startup details."],
              ["02", "Confirm the match", "Choose the right firm or partner from sourced matches."],
              ["03", "Research public signals", "Find dated firm, portfolio, thesis, and news sources."],
              ["04", "Review the brief", "Use cited claims, visible gaps, and conversation prompts."],
            ].map(([number, title, description]) => (
              <li className="how-card" key={number}>
                <span className="how-card__number">{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="trust-section">
          <div className="trust-section__heading">
            <p className="eyebrow">Why you can trust it</p>
            <h2>Evidence first. Unknowns stay unknown.</h2>
          </div>
          <div className="trust-grid">
            <article>
              <span className="trust-mark" aria-hidden="true">↗</span>
              <h3>Cited claims</h3>
              <p>Follow each claim back to the public source behind it.</p>
            </article>
            <article>
              <span className="trust-mark" aria-hidden="true">✓</span>
              <h3>Verifier checks</h3>
              <p>
                Unsupported claims are dropped instead of being polished into
                certainty.
              </p>
            </article>
            <article>
              <span className="trust-mark" aria-hidden="true">○</span>
              <h3>Honest gaps</h3>
              <p>When research does not support an answer, the brief says so.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <Link className="brand" href="/">
          <span className="brand__mark" aria-hidden="true">P</span>
          <span>pitchside</span>
        </Link>
        <div className="landing-footer__note">
          <span className="tavily-badge">
            <span className="tavily-badge__dot" />
            Search by Tavily
          </span>
          <p>Only professional public information is used.</p>
        </div>
      </footer>
    </div>
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
