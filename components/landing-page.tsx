"use client";

import { useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/site-header";

interface BriefProfile {
  id: string;
  name: string;
  category: string;
  meetingContext: string;
  oneLiner: string;
  whatsNew: {
    headline: string;
    date: string;
    source: string;
  }[];
  talkAbout: {
    angle: string;
    rationale: string;
  }[];
  questionsToAsk: {
    question: string;
    category: string;
  }[];
}

const profilesData: Record<"stripe" | "nvidia" | "sequoia" | "linear", BriefProfile> = {
  stripe: {
    id: "stripe",
    name: "Stripe",
    category: "Partner & Platform Sync",
    meetingContext: "Meeting with Patrick Collison, CEO · Tomorrow at 10:00 AM PST",
    oneLiner: "Financial infrastructure powering payments and commerce for internet businesses worldwide.",
    whatsNew: [
      {
        headline: "Released Agentic Payments Toolkit allowing autonomous AI agents to initiate governed transactions.",
        date: "Oct 27, 2026",
        source: "Stripe Newsroom",
      },
      {
        headline: "Crossed $1T annualized total payment volume run-rate across global enterprise merchants.",
        date: "Nov 05, 2026",
        source: "Reuters Financial",
      },
      {
        headline: "Confirmed Bridge stablecoin rails will integrate directly into core merchant checkout APIs.",
        date: "Nov 11, 2026",
        source: "Colossus Interview #412",
      },
    ],
    talkAbout: [
      {
        angle: "Agentic Checkout Controls",
        rationale: "Align with their new toolkit by discussing how early enterprise partners are governing autonomous spend limits.",
      },
      {
        angle: "Sub-Second Stablecoin Margins",
        rationale: "Reference John Collison's recent comments on cutting cross-border settlement from three banking days to seconds.",
      },
    ],
    questionsToAsk: [
      {
        question: "How are you seeing enterprise risk teams structure permission gates when autonomous agents initiate invoice payouts?",
        category: "Risk Governance",
      },
      {
        question: "Will Bridge stablecoin settlement be open to all standard Stripe Connect platforms in Q1?",
        category: "Product Roadmap",
      },
    ],
  },
  nvidia: {
    id: "nvidia",
    name: "Nvidia",
    category: "Architecture & Compute Review",
    meetingContext: "Roadmap Sync with VP Enterprise Infrastructure · Thursday at 2:00 PM PST",
    oneLiner: "Accelerated computing platform powering modern datacenter AI inference and industrial robotics.",
    whatsNew: [
      {
        headline: "Delivered first commercial Blackwell NVL72 liquid-cooled racks to sovereign datacenter customers.",
        date: "Oct 24, 2026",
        source: "Nvidia Press",
      },
      {
        headline: "Announced NIM microservices expansion for real-time edge robotics orchestration.",
        date: "Nov 03, 2026",
        source: "VentureBeat AI",
      },
      {
        headline: "Reported 140% YoY datacenter revenue growth driven by multi-agent reasoning workloads.",
        date: "Nov 09, 2026",
        source: "SEC EDGAR 10-Q Filing",
      },
    ],
    talkAbout: [
      {
        angle: "Liquid Cooling Deployment Density",
        rationale: "Discuss datacenter thermal headroom and power distribution constraints for upcoming cluster expansions.",
      },
      {
        angle: "Reasoning Model Token Latency",
        rationale: "Explore how the NVLink interconnect architecture reduces time-to-first-token in agentic inference swarms.",
      },
    ],
    questionsToAsk: [
      {
        question: "What are hyperscale customers doing to resolve regional substation power interconnect delays for 100MW+ clusters?",
        category: "Power Grid",
      },
      {
        question: "How will the NIM containerized deployment model evolve for on-premises enterprise data privacy requirements?",
        category: "Enterprise Software",
      },
    ],
  },
  sequoia: {
    id: "sequoia",
    name: "Sequoia Capital",
    category: "Investor & Growth Sync",
    meetingContext: "Partner Discussion with Lead Enterprise Partner · Friday at 11:30 AM PST",
    oneLiner: "Venture capital firm partnering with founders from conception to IPO.",
    whatsNew: [
      {
        headline: "Published research manifesto: 'The Act Two of Software Agents: From Prompts to Pipelines.'",
        date: "Oct 20, 2026",
        source: "Sequoia Perspectives",
      },
      {
        headline: "Co-led $180M growth round in autonomous software verification and synthetic testing infrastructure.",
        date: "Nov 02, 2026",
        source: "TechCrunch",
      },
      {
        headline: "Hosted European AI Founder Summit in London emphasizing defensibility against model commoditization.",
        date: "Nov 08, 2026",
        source: "Bloomberg Technology",
      },
    ],
    talkAbout: [
      {
        angle: "Proprietary Data Flywheels",
        rationale: "Demonstrate how your research workflow compounds contextual value with every user turn.",
      },
      {
        angle: "Unit Economic Discipline",
        rationale: "Provide clear visibility into your inference token efficiency and declining cost-per-brief trajectory.",
      },
    ],
    questionsToAsk: [
      {
        question: "In what enterprise categories are your portfolio companies seeing buyers commit upfront 7-figure AI ARR today?",
        category: "Market Demand",
      },
      {
        question: "How do your partners pressure-test durable moats in software sectors where foundation models release native features?",
        category: "Thesis Criteria",
      },
    ],
  },
  linear: {
    id: "linear",
    name: "Linear",
    category: "Product & Ecosystem Sync",
    meetingContext: "Partner Conversation with Head of Product · Monday at 3:00 PM PST",
    oneLiner: "The issue tracking and execution tool engineered for high-velocity software organizations.",
    whatsNew: [
      {
        headline: "Shipped Linear Asks 2.0 with AI auto-triage and bi-directional Slack resolution.",
        date: "Oct 22, 2026",
        source: "Linear Changelog",
      },
      {
        headline: "Launched Customer Requests syncing external enterprise tickets into internal engineering cycles.",
        date: "Nov 04, 2026",
        source: "Product Hunt",
      },
      {
        headline: "Expanded custom SOC2 and enterprise compliance controls for enterprise customer migrations.",
        date: "Nov 10, 2026",
        source: "Linear Enterprise",
      },
    ],
    talkAbout: [
      {
        angle: "Bi-Directional Context Sync",
        rationale: "Reference Linear Asks 2.0 to show how Pitchside meeting briefs can link into issue backlogs.",
      },
      {
        angle: "Latency-First UX Standards",
        rationale: "Complement their strict latency discipline to align on shared engineering quality standards.",
      },
    ],
    questionsToAsk: [
      {
        question: "How are you designing permission guardrails so autonomous agents don't create noise in developer sprint boards?",
        category: "Agent Architecture",
      },
      {
        question: "What have been the highest-performing webhook patterns for partner tools syncing rich external meeting summaries?",
        category: "API Ecosystem",
      },
    ],
  },
};

export default function LandingPage() {
  const [selectedProfile, setSelectedProfile] = useState<"stripe" | "nvidia" | "sequoia" | "linear">("stripe");
  const [highlighterEnabled, setHighlighterEnabled] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedQuestionIndex, setCopiedQuestionIndex] = useState<number | null>(null);
  const [isSwitching, setIsSwitching] = useState<boolean>(false);

  const profile = profilesData[selectedProfile];

  function copyQuestion(text: string, index: number) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedQuestionIndex(index);
      setToastMessage("Question copied to clipboard");
      setTimeout(() => {
        setCopiedQuestionIndex(null);
        setToastMessage(null);
      }, 2000);
    }
  }

  function handleProfileSwitch(id: "stripe" | "nvidia" | "sequoia" | "linear") {
    if (id === selectedProfile) return;
    setIsSwitching(true);
    setSelectedProfile(id);
    setTimeout(() => {
      setIsSwitching(false);
    }, 240);
  }

  return (
    <div className="landing-desk">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="desk-toast-alert" role="status">
          <span className="toast-check">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <SiteHeader />

      <main>
        {/* =========================================================================
            SECTION 01: THE HERO — Calm, Pure & Understandable in 5 Seconds
           ========================================================================= */}
        <section className="hero-section" id="hero">
          <div className="hero-container">
            <div className="hero-copy-column">
              <h1 className="hero-headline">
                Walk into every meeting{" "}
                <span className="headline-emphasis-wrap">
                  <em className="headline-emphasis-word">
                    prepared.
                    <svg
                      className="headline-underline-svg"
                      viewBox="0 0 240 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path
                        className="underline-draw-path"
                        d="M3 14C45 6 142 4 236 17M62 20C118 13 182 14 224 21"
                        stroke="#2E523A"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </em>
                </span>
              </h1>

              <p className="hero-paragraph">
                Tell us who you're meeting and when. We'll catch you up on what
                matters and give you questions worth asking.
              </p>

              <div className="hero-cta-group">
                <Link className="hero-primary-button" href="/new">
                  <span>Prepare a brief</span>
                  <span className="cta-arrow" aria-hidden="true">→</span>
                </Link>

                <a className="hero-secondary-link" href="#example-brief">
                  See an example
                </a>
              </div>
            </div>

            {/* Right Column: Pristine Transparent Stationery Folder */}
            <div className="hero-visual-column">
              <div className="hero-stationery-display">
                <img
                  src="/hero-folder-isolated.png"
                  alt="Pitchside meeting brief tucked in dark green leather folder"
                  className="folder-asset"
                  width={624}
                  height={682}
                  loading="eager"
                />
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 02: HOW IT WORKS — Minimal 3-Step Research Experience
           ========================================================================= */}
        <section className="how-it-works-section" id="how-it-works">
          <div className="section-container">
            <div className="section-header-block">
              <span className="section-kicker">HOW IT WORKS</span>
              <h2 className="section-heading">A little homework. A much better meeting.</h2>
              <p className="section-subheading">
                Turn thirty days of public news, product launches, and interviews into a
                three-minute read before you walk through the door.
              </p>
            </div>

            {/* 3 Calm, Tactile Stationery Step Cards */}
            <div className="three-steps-grid">
              {/* Step 1 */}
              <div className="step-card">
                <div className="step-card-meta">
                  <span className="step-number">01</span>
                  <span className="step-badge">INPUT</span>
                </div>
                <h3 className="step-title">Tell us who.</h3>
                <p className="step-desc">
                  Enter a person or company and your meeting date.
                </p>
                <div className="step-visual step-visual-input">
                  <div className="mock-input-row">
                    <span className="mock-input-label">Meeting with</span>
                    <span className="mock-input-value">Patrick Collison · Stripe</span>
                  </div>
                  <div className="mock-input-row">
                    <span className="mock-input-label">Date & Time</span>
                    <span className="mock-input-value">Tomorrow, 10:00 AM PST</span>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="step-card">
                <div className="step-card-meta">
                  <span className="step-number">02</span>
                  <span className="step-badge">RETRIEVAL</span>
                </div>
                <h3 className="step-title">We catch you up.</h3>
                <p className="step-desc">
                  We find important news, launches, hires, and updates from the preceding 30 days.
                </p>
                <div className="step-visual step-visual-slips">
                  <div className="research-slip slip-1">
                    <span className="slip-date">OCT 27</span>
                    <span className="slip-text">Agentic Payments Toolkit released</span>
                  </div>
                  <div className="research-slip slip-2">
                    <span className="slip-date">NOV 05</span>
                    <span className="slip-text">Crossed $1T annualized payment volume</span>
                  </div>
                  <div className="research-slip slip-3">
                    <span className="slip-date">NOV 11</span>
                    <span className="slip-text">Bridge stablecoin checkout APIs confirmed</span>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="step-card">
                <div className="step-card-meta">
                  <span className="step-number">03</span>
                  <span className="step-badge">ONE PAGE</span>
                </div>
                <h3 className="step-title">You walk in ready.</h3>
                <p className="step-desc">
                  Get a one-page brief with facts, conversation ideas, and open questions.
                </p>
                <div className="step-visual step-visual-brief">
                  <div className="mini-brief-top">
                    <span className="mini-brief-name">Stripe Briefing</span>
                    <span className="mini-brief-a4">A4 Format</span>
                  </div>
                  <div className="mini-brief-list">
                    <div className="mini-brief-item">
                      <span className="mini-check">✓</span>
                      <span>Three recent developments</span>
                    </div>
                    <div className="mini-brief-item">
                      <span className="mini-check">✓</span>
                      <span>Two useful discussion points</span>
                    </div>
                    <div className="mini-brief-item">
                      <span className="mini-check">✓</span>
                      <span>Two questions worth asking</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 03: SIMPLIFIED EXAMPLE BRIEF — Large, Readable & Executive
           ========================================================================= */}
        <section className="example-brief-section" id="example-brief">
          <div className="section-container">
            <div className="section-header-block">
              <span className="section-kicker">EXAMPLE BRIEF</span>
              <h2 className="section-heading">Everything you need. Nothing you don't.</h2>
              <p className="section-subheading">
                A clean, one-page brief formatted for rapid retention. Read it on desktop or print it on paper.
              </p>
            </div>

            {/* Profile Manila Tabs & Document Tools */}
            <div className="brief-toolbar-row">
              <div className="manila-tabs-group" role="tablist" aria-label="Sample Executive Brief Profiles">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedProfile === "stripe"}
                  className={`manila-tab-btn ${selectedProfile === "stripe" ? "manila-tab-active" : ""}`}
                  onClick={() => handleProfileSwitch("stripe")}
                >
                  <span className="tab-folder-icon">📁</span>
                  <span className="tab-title">Stripe</span>
                  <span className="tab-type">Partner Sync</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedProfile === "nvidia"}
                  className={`manila-tab-btn ${selectedProfile === "nvidia" ? "manila-tab-active" : ""}`}
                  onClick={() => handleProfileSwitch("nvidia")}
                >
                  <span className="tab-folder-icon">📁</span>
                  <span className="tab-title">Nvidia</span>
                  <span className="tab-type">Architecture</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedProfile === "sequoia"}
                  className={`manila-tab-btn ${selectedProfile === "sequoia" ? "manila-tab-active" : ""}`}
                  onClick={() => handleProfileSwitch("sequoia")}
                >
                  <span className="tab-folder-icon">📁</span>
                  <span className="tab-title">Sequoia Capital</span>
                  <span className="tab-type">Investor Pitch</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedProfile === "linear"}
                  className={`manila-tab-btn ${selectedProfile === "linear" ? "manila-tab-active" : ""}`}
                  onClick={() => handleProfileSwitch("linear")}
                >
                  <span className="tab-folder-icon">📁</span>
                  <span className="tab-title">Linear</span>
                  <span className="tab-type">Product Sync</span>
                </button>
              </div>

              {/* Utility Tools */}
              <div className="sheet-controls-group">
                <button
                  type="button"
                  className={`tool-button ${highlighterEnabled ? "tool-active" : ""}`}
                  onClick={() => setHighlighterEnabled(!highlighterEnabled)}
                  title="Toggle green highlighter pen marks"
                >
                  <span>🖍️ Highlight Marker</span>
                </button>

                <button
                  type="button"
                  className="tool-button"
                  onClick={() => {
                    if (typeof window !== "undefined") window.print();
                  }}
                  title="Print this executive briefing on standard A4 paper"
                >
                  <span>⎙ Print A4</span>
                </button>
              </div>
            </div>

            {/* The Large, Readable A4 Document Preview */}
            <div className={`a4-document-viewport ${isSwitching ? "sheet-assembling" : ""}`} id="sample-brief">
              <article className="tactile-brief-sheet">
                {/* Dossier Header */}
                <div className="dossier-top-bar">
                  <div className="dossier-left">
                    <span className="dossier-stamp">PITCHSIDE // EXECUTIVE BRIEF</span>
                    <span className="dossier-id">REF: PS-{profile.name.toUpperCase()}</span>
                  </div>
                  <div className="dossier-right">
                    <span className="dossier-spec">A4 FORMAT · ONE PAGE</span>
                  </div>
                </div>

                {/* Company & Meeting Context Header */}
                <header className="brief-headline-block">
                  <div className="header-meta-row">
                    <span className="brief-tag-bubble">{profile.category}</span>
                    <span className="meeting-time-pill">{profile.meetingContext}</span>
                  </div>

                  <h3 className="brief-title-name">
                    <span className={highlighterEnabled ? "marker-highlight active-marker-draw" : ""}>
                      {profile.name}
                    </span>
                  </h3>
                  <p className="brief-mission-quote">{profile.oneLiner}</p>
                </header>

                {/* 3 Essential Focus Areas */}
                <div className="brief-essential-grid">
                  {/* Focus Area 01: Three Recent Updates */}
                  <div className="brief-section-block">
                    <div className="block-header">
                      <span className="block-num">01</span>
                      <h4 className="block-title">What's New (Preceding 30 Days)</h4>
                    </div>

                    <div className="updates-list-stack">
                      {profile.whatsNew.map((item, idx) => (
                        <div key={idx} className="update-item-row">
                          <span className="item-bullet" />
                          <div className="item-body">
                            <p className="item-text">{item.headline}</p>
                            <span className="item-source-ref">
                              {item.source} · {item.date}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Focus Area 02: Two Useful Discussion Points */}
                  <div className="brief-section-block">
                    <div className="block-header">
                      <span className="block-num">02</span>
                      <h4 className="block-title">Useful Discussion Points</h4>
                    </div>

                    <div className="discussion-list-stack">
                      {profile.talkAbout.map((item, idx) => (
                        <div key={idx} className="discussion-item-card">
                          <span className="discussion-angle">"{item.angle}"</span>
                          <p className="discussion-rationale">{item.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Focus Area 03: Two Questions Worth Asking */}
                  <div className="brief-section-block">
                    <div className="block-header">
                      <span className="block-num">03</span>
                      <h4 className="block-title">Questions Worth Asking</h4>
                    </div>

                    <div className="questions-list-stack">
                      {profile.questionsToAsk.map((q, idx) => (
                        <div key={idx} className="question-item-card">
                          <div className="question-text-wrap">
                            <span className="question-cat-pill">{q.category}</span>
                            <p className="question-quote">"{q.question}"</p>
                          </div>
                          <button
                            type="button"
                            className={`q-copy-button ${copiedQuestionIndex === idx ? "q-copied-success" : ""}`}
                            onClick={() => copyQuestion(q.question, idx)}
                            title="Copy question text to clipboard"
                          >
                            {copiedQuestionIndex === idx ? "Copied! ✓" : "Copy 📋"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Document Archival Footer */}
                <footer className="tactile-sheet-footer">
                  <div className="footer-seal-line">
                    <span className="seal-text">ILLUSTRATIVE EXECUTIVE BRIEF // COMPILED FROM 30-DAY PUBLIC SOURCES</span>
                    <span className="seal-ready">PRINT-READY 1-PAGE SUMMARY</span>
                  </div>
                </footer>
              </article>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 04: CLOSING FINALE — The Single Elegant Closing Moment
            (Zero duplicate promotional panels)
           ========================================================================= */}
        <section className="finale-closing-scene">
          <div className="section-container">
            <h2 className="finale-headline">The best meetings begin before hello.</h2>
            <p className="finale-subhead">
              Know who is across the table. Walk in with the right context in three minutes.
            </p>

            <div className="finale-cta-wrap">
              <Link className="hero-primary-button finale-button" href="/new">
                <span>Prepare a brief</span>
                <span className="cta-arrow" aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="finale-trust-meta">
              <span>Free to use</span>
              <span className="trust-dot">·</span>
              <span>No sign-up required</span>
              <span className="trust-dot">·</span>
              <span>Powered by Tavily Search API</span>
            </div>
          </div>
        </section>
      </main>

      {/* Minimal Site Footer */}
      <footer className="site-footer">
        <div className="footer-container">
          <div className="footer-left">
            <span className="footer-brand">pitchside.</span>
            <span className="footer-attribution">
              AI meeting preparation agent built for the Global AI Hackathon (Tavily Side Track).
            </span>
          </div>

          <nav className="footer-nav">
            <Link href="/new">Prepare a brief</Link>
            <Link href="/demo">Sample brief</Link>
            <a href="#how-it-works">How it works</a>
            <a
              href="https://github.com/kritsii/globalai-tavily"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-github-link"
            >
              GitHub ↗
            </a>
            <a href="https://tavily.com" target="_blank" rel="noopener noreferrer">
              Tavily Search API ↗
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
