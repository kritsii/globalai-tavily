import Link from "next/link";
import SiteHeader from "@/components/site-header";

const sampleSources = [
  {
    number: 1,
    title: "Requests for Startups",
    domain: "ycombinator.com",
    url: "https://www.ycombinator.com/rfs",
    detail:
      "YC's RFS includes financing businesses for physical AI buildouts.",
  },
  {
    number: 2,
    title: "The Y Combinator Deal",
    domain: "ycombinator.com",
    url: "https://www.ycombinator.com/deal",
    detail:
      "YC describes a $500K deal: $125K post-money SAFE plus a $375K uncapped MFN SAFE.",
  },
];

export function SampleBriefPreview() {
  return (
    <article className="sample-brief">
      <div className="sample-brief__topline">
        <span>PITCHSIDE / FIELD NOTES</span>
        <span>ILLUSTRATIVE SAMPLE</span>
      </div>
      <h3>Y Combinator</h3>
      <p className="sample-brief__kicker">INVESTOR MEETING BRIEF</p>
      <p className="sample-brief__context">
        <strong>Sample founder context</strong>
        <span>Robotics finance software</span>
        <span>Seed</span>
        <span>$2M target</span>
      </p>

      <section className="sample-brief__section">
        <h4>At a glance</h4>
        <p>
          YC says Requests for Startups are ideas it would like founders to
          tackle, not a prerequisite for applying.
          <a className="sample-citation" href="#sample-source-1">[1]</a>
        </p>
        <p>
          YC&apos;s published standard deal is $500K: $125K for 7% on a
          post-money SAFE, plus a $375K uncapped MFN SAFE.
          <a className="sample-citation" href="#sample-source-2">[2]</a>
        </p>
      </section>

      <section className="sample-brief__section">
        <h4>Last 30 days</h4>
        <p className="sample-empty">
          No dated events are included: these static reference pages do not
          establish a 30-day activity window. A live brief searches dated
          launches, hires, departures, announcements, and news.
        </p>
      </section>

      <section className="sample-brief__section sample-fit">
        <h4>Fit with your startup</h4>
        <span className="sample-verdict">Potential alignment · not a verdict</span>
        <ul>
          <li>
            RFS describes financing businesses for physical AI; the
            hypothetical startup builds robotics finance software.
            <a className="sample-citation" href="#sample-source-1">[1]</a>
          </li>
          <li>
            YC publishes a $500K standard deal; how it compares with a $2M
            target needs discussion.
            <a className="sample-citation" href="#sample-source-2">[2]</a>
          </li>
        </ul>
      </section>

      <section className="sample-brief__section">
        <h4>Open questions</h4>
        <ol>
          <li>
            Would robotics finance fit YC&apos;s published physical-AI finance
            interests?
          <a className="sample-citation" href="#sample-source-1">[1]</a>
          </li>
          <li>
            How would the published SAFE structure work alongside a $2M target?
            <a className="sample-citation" href="#sample-source-2">[2]</a>
          </li>
          <li>
            Which part of the product finances robots or GPU capacity?
            <a className="sample-citation" href="#sample-source-1">[1]</a>
          </li>
        </ol>
      </section>

      <section className="sample-brief__section">
        <h4>Gaps and uncertain</h4>
        <ul className="sample-gaps">
          <li>Static sources do not show dated activity for the last 30 days.</li>
          <li>Portfolio overlap and partner ownership are not assessed here.</li>
          <li>Startup details are illustrative, not founder-provided.</li>
        </ul>
      </section>

      <div className="sample-brief__sources">
        <h4>Sources</h4>
        <ol>
          {sampleSources.map((source) => (
            <li id={`sample-source-${source.number}`} key={source.number}>
              <a href={source.url} target="_blank" rel="noreferrer">
                <span className="sample-source__number">[{source.number}]</span>
                <span className="sample-source__copy">
                  <strong>{source.title}</strong>
                  <small>{source.domain}</small>
                  <span>{source.detail}</span>
                </span>
                <span className="sample-source__arrow" aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
      <p className="sample-brief__note">
        Illustrative example, not a live diligence result. The sample startup
        is hypothetical; source pages may change.
      </p>
    </article>
  );
}

export default function DemoBrief() {
  return (
    <>
      <SiteHeader />
      <main className="demo-page">
        <div className="demo-page__heading">
          <div>
            <p className="eyebrow">Sample brief</p>
            <h1>A preview of the source-linked format.</h1>
            <p>
              This seeded sample demonstrates the layout; it is not a live
              research result or an assessment of your startup.
            </p>
          </div>
          <Link className="button button-primary landing-cta" href="/new">
            Create a brief
          </Link>
        </div>
        <SampleBriefPreview />
      </main>
    </>
  );
}
