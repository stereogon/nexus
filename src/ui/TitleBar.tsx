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
import type { Theme } from "../ipc/theme";
import type { LectureRow } from "../ipc/vault";
import { THEME_LABEL } from "./useTheme";

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

/** Sun, moon, or half-and-half for following the system. */
function ThemeIcon({ theme }: { readonly theme: Theme }) {
  if (theme === "light") {
    return (
      <svg aria-hidden="true" height="15" viewBox="0 0 15 15" width="15">
        <circle cx="7.5" cy="7.5" fill="none" r="3.2" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M7.5 1 L7.5 2.6 M7.5 12.4 L7.5 14 M1 7.5 L2.6 7.5 M12.4 7.5 L14 7.5 M3 3 L4.1 4.1 M10.9 10.9 L12 12 M12 3 L10.9 4.1 M4.1 10.9 L3 12"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.3"
        />
      </svg>
    );
  }

  if (theme === "dark") {
    return (
      <svg aria-hidden="true" height="15" viewBox="0 0 15 15" width="15">
        <path
          d="M12.2 9.3 A5.4 5.4 0 1 1 5.7 2.8 A4.3 4.3 0 0 0 12.2 9.3 Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.3"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" height="15" viewBox="0 0 15 15" width="15">
      <circle cx="7.5" cy="7.5" fill="none" r="5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.5 2.5 A5 5 0 0 1 7.5 12.5 Z" fill="currentColor" />
    </svg>
  );
}

export function TitleBar({
  lecture,
  sidebarShown,
  theme,
  onToggleSidebar,
  onCycleTheme,
  errorsShown,
  onToggleErrors,
  libraryShown,
  onToggleLibrary,
}: {
  readonly lecture: LectureRow | null;
  readonly sidebarShown: boolean;
  readonly theme: Theme;
  readonly onToggleSidebar: () => void;
  readonly onCycleTheme: () => void;
  readonly errorsShown: boolean;
  readonly onToggleErrors: () => void;
  readonly libraryShown: boolean;
  readonly onToggleLibrary: () => void;
}) {
  const facets =
    lecture === null
      ? []
      : [lecture.course, lecture.module, lecture.week].filter(
          (facet): facet is string => facet !== null,
        );

  return (
    <header className="titlebar">
      <div className="titlebar-controls" />

      <div className="wordmark">
        <Mark />
        <span>Nexus</span>
      </div>

      <div className="crumbs">
        {facets.length > 0 && (
          <span className="crumbs-path">{`${facets.join(" / ")} /`}</span>
        )}
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

      {/* Not on the canvas, which has light and dark artboards but no control to choose
          between them. Added because following macOS was the only way to change theme,
          and there was no way to pin one. It cycles system → light → dark. */}
      <button
        aria-label={THEME_LABEL[theme]}
        className="chrome-icon"
        onClick={onCycleTheme}
        title={THEME_LABEL[theme]}
        type="button"
      >
        <ThemeIcon theme={theme} />
      </button>

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
