/**
 * The window's own bar: mark, where you are, and the two chrome controls.
 *
 * From the canvas's Workspace artboards. The window is configured with
 * `titleBarStyle: "Transparent"`, so macOS draws its traffic lights over our chrome — the
 * leading gap is there to leave room for them rather than to space anything.
 *
 * The breadcrumb is the canvas's `CS454 / Week 03 / 01 Raft Consensus`: the facets a
 * lecture carries, then its title. It is built from the lecture itself rather than from
 * the sidebar's current grouping, because it answers "what am I looking at", not "how is
 * the list arranged".
 */
import { useState } from "react";

import type { LectureRow } from "../ipc/vault";
import { parentOf, spoken } from "./folders";
import type { MenuAt } from "./menuPlacement";
import { ThemePicker } from "./ThemePicker";
import type { ThemeName } from "./themes";

/** The mark from the canvas: a path through three nodes, the middle one in ink. */
function Mark() {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M4 3.5 L12 8 L4 12.5"
        fill="none"
        stroke="var(--accent)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <circle cx="4" cy="3.5" fill="var(--accent)" r="2" />
      <circle cx="12" cy="8" fill="var(--text)" r="2" />
      <circle cx="4" cy="12.5" fill="var(--accent)" r="2" />
    </svg>
  );
}

/** A highlighter's stroke under two lines of text: the highlights library. */
function HighlightsIcon() {
  return (
    <svg aria-hidden="true" height="15" viewBox="0 0 15 15" width="15">
      <rect fill="currentColor" height="4" opacity="0.35" rx="1" width="11" x="2" y="3" />
      <path d="M2.5 5h10M2.5 10.5h7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg aria-hidden="true" height="15" viewBox="0 0 15 15" width="15">
      <rect
        fill="none"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.3"
        width="12"
        x="1.5"
        y="2.5"
      />
      <path d="M5.5 2.5 L5.5 12.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function LogsIcon() {
  return (
    <svg aria-hidden="true" height="15" viewBox="0 0 15 15" width="15">
      <path
        d="M7.5 1.8 L13.4 12.2 L1.6 12.2 Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path d="M7.5 5.6 L7.5 8.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
      <circle cx="7.5" cy="10.4" fill="currentColor" r="0.8" />
    </svg>
  );
}

/** A palette: the control opens the theme picker. */
function ThemeIcon() {
  return (
    <svg aria-hidden="true" height="15" viewBox="0 0 15 15" width="15">
      <path
        d="M7.5 1.6 A5.9 5.9 0 1 0 7.5 13.4 C8.4 13.4 8.7 12.6 8.2 11.9 C7.7 11.2 8.1 10.3 9 10.3 L10.6 10.3 A2.8 2.8 0 0 0 13.4 7.5 A5.9 5.9 0 0 0 7.5 1.6 Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <circle cx="4.6" cy="7" fill="currentColor" r="0.9" />
      <circle cx="6.6" cy="4.4" fill="currentColor" r="0.9" />
      <circle cx="9.6" cy="4.8" fill="currentColor" r="0.9" />
    </svg>
  );
}

export function TitleBar({
  lecture,
  sidebarShown,
  theme,
  onToggleSidebar,
  onChooseTheme,
  errorsShown,
  onToggleErrors,
  libraryShown,
  onToggleLibrary,
}: {
  readonly lecture: LectureRow | null;
  readonly sidebarShown: boolean;
  readonly theme: ThemeName;
  readonly onToggleSidebar: () => void;
  readonly onChooseTheme: (theme: ThemeName) => void;
  readonly errorsShown: boolean;
  readonly onToggleErrors: () => void;
  readonly libraryShown: boolean;
  readonly onToggleLibrary: () => void;
}) {
  // Where the theme picker opens, while it is open.
  const [picking, setPicking] = useState<MenuAt | null>(null);
  // The folders the open item is in: where it is, now that a folder is where it belongs.
  const place = lecture === null ? "" : spoken(parentOf(lecture.directory));

  return (
    <header className="titlebar">
      <div className="titlebar-controls" />

      <div className="wordmark">
        <Mark />
        <span>Nexus</span>
      </div>

      <div className="crumbs">
        {place !== "" && <span className="crumbs-path">{`${place} /`}</span>}
        {lecture !== null && <span className="crumbs-here">{lecture.title}</span>}
      </div>

      <button
        aria-label="Toggle sidebar"
        aria-pressed={sidebarShown}
        className="chrome-icon"
        onClick={onToggleSidebar}
        title="Toggle sidebar"
        type="button"
      >
        <SidebarIcon />
      </button>

      {/* Not on the canvas yet: the library was asked for after the artboards were drawn. */}
      <button
        aria-label="Highlights library"
        aria-pressed={libraryShown}
        className="chrome-icon"
        onClick={onToggleLibrary}
        title="All highlights"
        type="button"
      >
        <HighlightsIcon />
      </button>

      {/* Opens the theme picker: fifteen themes and following macOS (2026-11-07). */}
      <button
        aria-expanded={picking !== null}
        aria-haspopup="menu"
        aria-label="Theme"
        className="chrome-icon"
        data-opens-theme=""
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();

          setPicking((open) => (open === null ? { left: box.right - 380, top: box.bottom + 6, above: box.top - 6 } : null));
        }}
        title="Theme"
        type="button"
      >
        <ThemeIcon />
      </button>
      {picking !== null && (
        <ThemePicker
          at={picking}
          onChoose={onChooseTheme}
          onDismiss={() => {
            setPicking(null);
          }}
          theme={theme}
        />
      )}

      {/* Where the canvas puts the diagnostics control. It opens the error panel — the
          errors shown since launch — which is the part of the spec's drawer built so far. */}
      <button
        aria-label="Errors"
        aria-pressed={errorsShown}
        className="chrome-icon"
        onClick={onToggleErrors}
        title="Errors (⌘0)"
        type="button"
      >
        <LogsIcon />
      </button>
    </header>
  );
}
