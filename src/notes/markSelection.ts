/**
 * Highlighting in the notes editor: applying a mark to the selection, and where the
 * four-colour bar goes for it.
 *
 * The rules — what wrapping, recolouring or removing changes — are `marks.ts`, pure and
 * tested; this applies them to a live editor.
 */
import type { EditorView } from "@codemirror/view";

import type { HighlightSemantic } from "../ipc/annotations";
import type { MenuAt } from "../ui/menuPlacement";
import { markChanges, marksIn } from "./marks";

/** Marks, recolours or unmarks the selection; `true` if anything changed. */
export function markSelection(view: EditorView, semantic: HighlightSemantic | null): boolean {
  const { from, to } = view.state.selection.main;
  const changes = markChanges(view.state.doc.toString(), from, to, semantic);

  if (changes.length === 0) {
    return false;
  }

  const set = view.state.changes(changes);

  // The cursor goes just after what was marked, which also closes the bar: the job is done.
  view.dispatch({ changes: set, selection: { anchor: set.mapPos(to, 1) } });

  return true;
}

/**
 * Where the four-colour bar goes for the current selection, or `null` if there should be
 * none: nothing selected, or the editor not focused. `current` is the mark the selection
 * is inside, so the bar can show it pressed and offer Remove.
 */
export function barFor(view: EditorView): { at: MenuAt; current: HighlightSemantic | null } | null {
  const { from, to, empty } = view.state.selection.main;

  if (empty || !view.hasFocus) {
    return null;
  }

  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);

  if (start === null || end === null) {
    return null;
  }

  const line = view.state.doc.lineAt(from);
  const around = marksIn(line.text, line.from).find((mark) => mark.from <= from && to <= mark.to);

  return {
    at: { left: start.left, top: end.bottom + 8, above: start.top - 8 },
    current: around?.semantic ?? null,
  };
}
