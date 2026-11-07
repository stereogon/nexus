/**
 * The document's header strip (redesign canvas, 2026-11-07): where it is and what it is
 * called, then how it is worked on — the tool, the view, find, the notes — and closing it.
 * Pages and zoom float at the foot of the document instead (`PageControls`).
 *
 * The Select | Box switch is the box tool from 2026-11-05 (asked for because Option-drag
 * is awkward on a touchpad), drawn as the canvas's tool control. The canvas also draws a
 * Sticky tool; sticky notes are made from the highlight menu, so there is no third tool
 * until there is something for it to do.
 */
import type { ViewMode } from "./viewMode";

export function PdfToolbar({
  title,
  place,
  mode,
  onClose,
  onMode,
  boxing,
  onBoxing,
  onFind,
  notesOpen,
  onNotes,
}: {
  readonly title: string;
  /** The folders the document is in, as `CS454 / Week 3`; empty at the top of the vault. */
  readonly place: string;
  readonly mode: ViewMode;
  readonly onClose: () => void;
  readonly onMode: (mode: ViewMode) => void;
  /** Whether a plain drag draws a box rather than selecting text. */
  readonly boxing: boolean;
  readonly onBoxing: (on: boolean) => void;
  readonly onFind: () => void;
  /** Whether the notes are showing beside the document. */
  readonly notesOpen: boolean;
  readonly onNotes: () => void;
}) {
  return (
    <div className="viewer-bar pane-head lead" data-tauri-drag-region="">
      <span className="viewer-title" data-tauri-drag-region="">
        {place !== "" && <span className="viewer-place">{`${place} /`}</span>}
        {title}
      </span>

      <div aria-label="Tool" className="segmented" role="group">
        <button
          aria-pressed={!boxing}
          onClick={() => {
            onBoxing(false);
          }}
          title="Select text to highlight it"
          type="button"
        >
          Select
        </button>
        <button
          aria-pressed={boxing}
          onClick={() => {
            onBoxing(true);
          }}
          title="Draw a box around a diagram or scan (or hold Option and drag)"
          type="button"
        >
          Box
        </button>
      </div>

      <div aria-label="View mode" className="segmented" role="group">
        <button
          aria-pressed={mode === "scroll"}
          onClick={() => {
            onMode("scroll");
          }}
          type="button"
        >
          Scroll
        </button>
        <button
          aria-pressed={mode === "page"}
          onClick={() => {
            onMode("page");
          }}
          type="button"
        >
          Page
        </button>
      </div>

      <button aria-label="Find in document" className="chrome-icon" onClick={onFind} title="Find (⌘F)" type="button">
        <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" viewBox="0 0 16 16" width="16">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.4 10.4l3.2 3.2" />
        </svg>
      </button>
      <button
        aria-label="Notes"
        aria-pressed={notesOpen}
        className="chrome-icon"
        onClick={onNotes}
        title={"Show or hide the notes (⌘\\)"}
        type="button"
      >
        <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeWidth="1.4" viewBox="0 0 16 16" width="16">
          <rect height="10" rx="2" width="12" x="2" y="3" />
          <path d="M10 3v10" />
        </svg>
      </button>
      <button aria-label="Close document" className="chrome-icon" onClick={onClose} title="Close" type="button">
        <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" viewBox="0 0 14 14" width="14">
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
        </svg>
      </button>
    </div>
  );
}
