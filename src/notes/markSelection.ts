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
import type { FormatState } from "../ui/NotesFormatBar";
import { blockOf, hasInline, linkAround, setBlock, toggleInline, type Block, type Inline } from "./format";
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
 * Applies changes that keep the words selected, so a second format can follow without
 * selecting again — bold, then italic, as in Notion.
 */
function keepingSelection(view: EditorView, changes: Parameters<EditorView["state"]["changes"]>[0]): void {
  const { from, to } = view.state.selection.main;
  const set = view.state.changes(changes);

  view.dispatch({ changes: set, selection: { anchor: set.mapPos(from, 1), head: set.mapPos(to, -1) } });
}

/** Bold, italic, strikethrough or code on the selection, or off it if it has it. */
export function formatInline(view: EditorView, kind: Inline): boolean {
  const { from, to } = view.state.selection.main;

  if (from === to) {
    return false;
  }

  keepingSelection(view, toggleInline(view.state.doc.toString(), from, to, kind));

  return true;
}

/** A heading, list or quote for every line the selection touches; pressed again, a paragraph. */
export function formatBlock(view: EditorView, block: Block): boolean {
  const { from, to } = view.state.selection.main;

  keepingSelection(view, setBlock(view.state.doc.toString(), from, to, block));

  return true;
}

/** `[words]()` around the selection, with the cursor where the address is typed. */
export function formatLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;

  if (from === to) {
    return false;
  }

  const { changes, cursor } = linkAround(view.state.doc.toString(), from, to);

  view.dispatch({ changes, selection: { anchor: cursor } });

  return true;
}

/**
 * Where the format bar goes for the current selection, and what the selection already
 * has, or `null` if there should be no bar: nothing selected, or the editor not focused.
 */
export function barFor(view: EditorView): { at: MenuAt; state: FormatState } | null {
  const { from, to, empty } = view.state.selection.main;

  if (empty || !view.hasFocus) {
    return null;
  }

  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);

  if (start === null || end === null) {
    return null;
  }

  const doc = view.state.doc.toString();
  const line = view.state.doc.lineAt(from);
  const around = marksIn(line.text, line.from).find((mark) => mark.from <= from && to <= mark.to);

  return {
    at: { left: start.left, top: end.bottom + 8, above: start.top - 8 },
    state: {
      inline: {
        bold: hasInline(doc, from, to, "bold"),
        italic: hasInline(doc, from, to, "italic"),
        strike: hasInline(doc, from, to, "strike"),
        code: hasInline(doc, from, to, "code"),
      },
      block: blockOf(line.text),
      highlight: around?.semantic ?? null,
    },
  };
}
