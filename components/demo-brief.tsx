import Link from "next/link";
import SiteHeader from "@/components/site-header";

const sampleSources = [
  {
    number: 1,
    title: "Requests for Startups",
    domain: "ycombinator.com",
    url: "https://www.ycombinator.com/rfs",
  },
  {
    number: 2,
    title: "The YC Deal",
    domain: "ycombinator.com",
    url: "https://www.ycombinator.com/deal",
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

      <section className="sample-brief__section">
        <h4>At a glance</h4>
        <p>
          Example preview of a source-linked firm overview.
          <a className="sample-citation" href="#sample-source-1">[1]</a>
          <span className="sample-confidence">Single source</span>
        </p>
      </section>
      <section className="sample-brief__section">
        <h4>What they&apos;re looking for now</h4>
        <p>
          Review the public Requests for Startups when preparing a thesis
          conversation.
          <a className="sample-citation" href="#sample-source-1">[1]</a>
        </p>
      </section>
      <section className="sample-brief__section">
        <h4>Deal terms and process</h4>
        <p>
          Refer to the firm&apos;s published deal page for its current terms.
          <a className="sample-citation" href="#sample-source-2">[2]</a>
        </p>
      </section>
      <section className="sample-brief__section sample-fit">
        <h4>Fit with your startup</h4>
        <span className="sample-verdict">Not enough evidence</span>
        <p>Specific sector, stage, and raise details are needed to assess fit.</p>
      </section>
      <section className="sample-brief__section">
        <h4>Recent signals</h4>
        <p className="sample-muted">No dated updates in the last 30 days</p>
      </section>
      <section className="sample-brief__section">
        <h4>Conversation starters</h4>
        <p>
          Which published focus areas should we explore in more depth?
          <a className="sample-citation" href="#sample-source-1">[1]</a>
        </p>
      </section>
      <section className="sample-brief__section">
        <h4>Gaps</h4>
        <p className="sample-muted">
          The preview does not include a founder profile or live research run.
        </p>
      </section>

      <div className="sample-brief__sources">
        <h4>Sources</h4>
        <ol>
          {sampleSources.map((source) => (
            <li id={`sample-source-${source.number}`} key={source.number}>
              <a href={source.url} target="_blank" rel="noreferrer">
                <span>[{source.number}]</span> {source.title}
                <small>{source.domain}</small>
              </a>
            </li>
          ))}
        </ol>
      </div>
      <p className="sample-brief__note">
        Seeded sample for layout demonstration; verify source pages for current
        details.
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
