"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function SiteHeader() {
  useEffect(() => {
    const savedTheme = window.localStorage.getItem("pitchside-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      document.documentElement.dataset.theme = savedTheme;
    }
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const current =
      root.dataset.theme ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    root.dataset.theme = current === "dark" ? "light" : "dark";
    window.localStorage.setItem("pitchside-theme", root.dataset.theme);
  }

  return (
    <header className="app-header landing-header">
      <Link className="brand" href="/" aria-label="Pitchside home">
        <span className="brand__mark" aria-hidden="true">
          P
        </span>
        <span>pitchside</span>
        <span className="brand__beta">FIELDNOTES</span>
      </Link>
      <nav className="landing-nav" aria-label="Main navigation">
        <Link href="/demo">Sample brief</Link>
        <Link className="button button-primary landing-nav__cta" href="/new">
          New brief
        </Link>
        <button
          aria-label="Toggle light and dark theme"
          className="theme-toggle landing-theme-toggle"
          onClick={toggleTheme}
          title="Toggle theme"
          type="button"
        >
          <ThemeIcon />
        </button>
      </nav>
    </header>
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
