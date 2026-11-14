/**
 * The notes pane's header: what the notes are, whether they are saved, the formatting
 * toggle, and the buttons that change the view — Notes only beside a document; Show
 * document and Close when the notes are on their own. Split from `NotesPane` on
 * 2026-11-09, when those buttons became icons and the pane passed the line limit.
 */
import type { SaveStatus } from "./useNotes";

/** What the header says about the last save. Plain words: the reader is not a developer. */
const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: "Opening…",
  saved: "Saved",
  unsaved: "Editing",
  saving: "Saving…",
  conflict: "Not saved — changed elsewhere",
  failed: "Not saved",
};

/** The notes on their own: a plain note's, or a document's with the document hidden. */
export interface Alone {
  readonly title: string;
  readonly place: string;
  readonly onClose: () => void;
  /** A document's notes shown alone: brings the document back beside them. */
  readonly onShowDocument?: () => void;
}

export function NotesHeader({
  alone,
  status,
  formatting,
  onFormatting,
  onHide,
  onNotesOnly,
}: {
  readonly alone: Alone | null;
  readonly status: SaveStatus;
  readonly formatting: boolean;
  readonly onFormatting: () => void;
  readonly onHide: () => void;
  readonly onNotesOnly: (() => void) | undefined;
}) {
  return (
    <header className="notes-bar pane-head" data-tauri-drag-region="">
      <span className="notes-title" data-tauri-drag-region="">
        {alone !== null && alone.place !== "" && <span className="viewer-place">{`${alone.place} /`}</span>}
        {alone === null ? "Notes" : alone.title}
      </span>
      <span aria-live="polite" className={`notes-status ${status}`}>
        {STATUS_TEXT[status]}
      </span>
      <button
        aria-label="Formatting"
        aria-pressed={formatting}
        className="chrome-icon notes-format-toggle"
        // Not taking focus, so the cursor stays where the next words will be typed.
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          onFormatting();
        }}
        title={formatting ? "Hide formatting" : "Show formatting"}
        type="button"
      >
        Aa
      </button>
      {alone === null && onNotesOnly !== undefined && (
        <button aria-label="Notes only" className="chrome-icon" onClick={onNotesOnly} title="Hide the document and keep writing" type="button">
          <svg aria-hidden="true" fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" viewBox="0 0 16 16" width="15">
            <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
          </svg>
        </button>
      )}
      {alone?.onShowDocument !== undefined && (
        // Two panes side by side: the view it goes back to (an icon, 2026-11-09; the word
        // button wrapped onto two lines in a narrow header).
        <button
          aria-label="Show document"
          className="chrome-icon"
          onClick={alone.onShowDocument}
          title="Show the document beside the notes (⌘\\)"
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" viewBox="0 0 16 16" width="16">
            <rect height="11" rx="1.6" width="13" x="1.5" y="2.5" />
            <path d="M8 2.5v11" />
          </svg>
        </button>
      )}
      {alone === null ? (
        <button aria-label="Hide notes" className="chrome-icon" onClick={onHide} title={"Hide notes (⌘\\)"} type="button">
          <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" viewBox="0 0 14 14" width="14">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
          </svg>
        </button>
      ) : (
        <button aria-label="Close" className="chrome-icon" onClick={alone.onClose} title="Close" type="button">
          <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" viewBox="0 0 14 14" width="14">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
          </svg>
        </button>
      )}
    </header>
  );
}
