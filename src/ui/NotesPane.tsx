/**
 * The notes beside the document: a header, what has happened to the last save, and the
 * editor.
 *
 * Styled to sit with the viewer it is next to — the same chrome bar, the same type — and
 * not yet from the canvas. The canvas could not be opened from the account in use when
 * this was built, and the user chose to wire the pane now and restyle it from the
 * artboards once they are readable (2026-11-05). Recorded in `PROGRESS.md` as owing that
 * pass, rather than looking finished.
 */
import type { Ref } from "react";

import { Failure } from "./Failure";
import { NotesEditor, type NotesHandle } from "./NotesEditor";
import { useNotes, type SaveStatus } from "./useNotes";

/** What the header says about the last save. Plain words: the reader is not a developer. */
const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: "Opening…",
  saved: "Saved",
  unsaved: "Editing",
  saving: "Saving…",
  conflict: "Not saved — changed elsewhere",
  failed: "Not saved",
};

export function NotesPane({
  vault,
  directory,
  handle,
  onCite,
  onHide,
  onReady,
  hidden,
}: {
  readonly vault: string;
  readonly directory: string;
  readonly handle: Ref<NotesHandle>;
  /** A `cite://` badge was clicked. */
  readonly onCite: (id: string) => void;
  readonly onHide: () => void;
  readonly onReady: () => void;
  /** Hidden rather than unmounted, so the cursor and undo history survive. */
  readonly hidden: boolean;
}) {
  const notes = useNotes(vault, directory);

  return (
    <aside aria-label="Notes" className="notes-pane" hidden={hidden}>
      <header className="notes-bar">
        <span className="notes-title">Notes</span>
        <span aria-live="polite" className={`notes-status ${notes.status}`}>
          {STATUS_TEXT[notes.status]}
        </span>
        <button aria-label="Hide notes" className="quiet" onClick={onHide} type="button">
          ✕
        </button>
      </header>

      {notes.onDisk !== null && (
        <div className="notes-conflict" role="alert">
          <p>
            <strong>notes.md was changed outside Nexus</strong> — on another device or in another
            app — while you were writing here. Your text is still in the editor and has not
            been saved over it.
          </p>
          <details>
            <summary>Show the other version</summary>
            <pre>{notes.onDisk.text === "" ? "(empty)" : notes.onDisk.text}</pre>
          </details>
          <div className="notes-conflict-actions">
            <button onClick={notes.keepMine} type="button">
              Keep mine
            </button>
            <button className="secondary" onClick={notes.takeTheirs} type="button">
              Use the other version
            </button>
          </div>
        </div>
      )}

      {notes.failure !== null && <Failure error={notes.failure} />}

      {notes.loaded !== null && (
        <NotesEditor
          generation={notes.generation}
          handle={handle}
          onChange={notes.change}
          onCite={onCite}
          onReady={onReady}
          text={notes.loaded.text}
        />
      )}
    </aside>
  );
}
