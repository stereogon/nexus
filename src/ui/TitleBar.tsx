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
import type { LectureRow } from "../ipc/vault";

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

export function TitleBar({
  lecture,
  sidebarShown,
  onToggleSidebar,
}: {
  readonly lecture: LectureRow | null;
  readonly sidebarShown: boolean;
  readonly onToggleSidebar: () => void;
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

      {/* Not yet wired: the diagnostics drawer is Milestone 5. Shown and disabled rather
          than hidden, because the canvas puts it here and a control that appears later
          moves everything beside it. */}
      <button
        aria-label="Diagnostic logs"
        className="chrome-icon"
        disabled
        title="Diagnostic logs — Milestone 5"
        type="button"
      >
        <LogsIcon />
      </button>
    </header>
  );
}
