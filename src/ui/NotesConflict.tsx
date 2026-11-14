/**
 * Saying that the file being written in changed outside Nexus while it was open, with both
 * versions kept and the choice the person's. Moved out of `NotesPane` (2026-11-14), unchanged
 * but for naming a page when it is a page that changed.
 */
import type { Notes } from "../ipc/notes";

export function NotesConflict({
  onDisk,
  onPage,
  onKeepMine,
  onTakeTheirs,
}: {
  readonly onDisk: Notes;
  /** Whether it is a page rather than the item's `notes.md`. */
  readonly onPage: boolean;
  readonly onKeepMine: () => void;
  readonly onTakeTheirs: () => void;
}) {
  return (
    <div className="notes-conflict" role="alert">
      <p>
        <strong>{onPage ? "This page was changed outside Nexus" : "notes.md was changed outside Nexus"}</strong> — on another
        device or in another app — while you were writing here. Your text is still in the editor and has not been saved over it.
      </p>
      <details>
        <summary>Show the other version</summary>
        <pre>{onDisk.text === "" ? "(empty)" : onDisk.text}</pre>
      </details>
      <div className="notes-conflict-actions">
        <button onClick={onKeepMine} type="button">
          Keep mine
        </button>
        <button className="secondary" onClick={onTakeTheirs} type="button">
          Use the other version
        </button>
      </div>
    </div>
  );
}
