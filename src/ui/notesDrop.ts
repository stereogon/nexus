/**
 * Where a file dragged onto the window is going: into the notes, or into the vault.
 *
 * Tauri delivers one drag for the whole window (`ipc/dragdrop.ts`), and until 2026-11-05
 * every drop meant "import this as a lecture" — so an image dropped on the notes became a
 * refused import. The notes pane now registers itself here while it is on screen, and the
 * drop zone asks, for each position a drag reports, whether that point is over it.
 *
 * A module-level slot rather than a React context: there is at most one notes pane, the
 * drop zone lives in `App` far above it, and the question asked — "is this point over the
 * notes?" — is about the DOM, not about React state.
 */

/** A point in the window, in CSS pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface NotesDropTarget {
  /** The pane; a drag over its box is a drag over the notes. */
  readonly element: HTMLElement;
  /** A drag is over the notes, or has left them. */
  readonly hover: (over: boolean) => void;
  /** Files dropped on the notes, and where. */
  readonly drop: (paths: readonly string[], at: Point) => void;
}

let registered: NotesDropTarget | null = null;

/** Takes drops for the notes while mounted; returns the way to stop. */
export function acceptNotesDrops(target: NotesDropTarget): () => void {
  registered = target;

  return () => {
    if (registered === target) {
      registered = null;
    }
  };
}

/** The notes, if `at` is over them and they are on screen; otherwise `null`. */
export function notesDropAt(at: Point): NotesDropTarget | null {
  if (registered === null) {
    return null;
  }

  // A hidden pane has an empty box, so this also says "not while the notes are hidden".
  const box = registered.element.getBoundingClientRect();
  const inside = at.x >= box.left && at.x < box.right && at.y >= box.top && at.y < box.bottom;

  return inside && box.width > 0 ? registered : null;
}
