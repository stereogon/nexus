/**
 * Highlighting in the notes editor: applying a mark to the selection, and where the
 * four-colour bar goes for it.
 *
 * The rules — what wrapping, recolouring or removing changes — are `marks.ts`, pure and
 * tested; this applies them to a live editor.
 */
import { Annotation } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";

import type { HighlightSemantic } from "../ipc/annotations";
import type { MenuAt } from "../ui/menuPlacement";
import type { FormatState } from "../ui/NotesFormatBar";
import { blockOf, cursorInside, hasInline, inlineAtCursor, linkAround, setBlock, toggleInline, type Block, type Inline } from "./format";
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

  // A bare cursor goes after what was inserted at it. Mapped as a selection's two ends, it
  // became a selection of the new `## `, and the first letter typed replaced it.
  view.dispatch({
    changes: set,
    selection: from === to ? { anchor: set.mapPos(from, 1) } : { anchor: set.mapPos(from, 1), head: set.mapPos(to, -1) },
  });
}

/**
 * Bold, italic, strikethrough or code on the selection, or off it if it has it; with nothing
 * selected, a pair of markers to type into (`inlineAtCursor`).
 */
export function formatInline(view: EditorView, kind: Inline): boolean {
  const { from, to } = view.state.selection.main;

  if (from === to) {
    const { changes, cursor } = inlineAtCursor(view.state.doc.toString(), from, kind);

    view.dispatch({ changes, selection: { anchor: cursor } });
    return true;
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

/**
 * `[words]()` around the selection, with the cursor where the address is typed; with
 * nothing selected, `[]()` with the cursor where the words go.
 */
export function formatLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const { changes, cursor } = linkAround(view.state.doc.toString(), from, to);

  view.dispatch({ changes, selection: { anchor: cursor } });

  return true;
}

/**
 * What the selection or the cursor already has, for showing each control pressed. A cursor
 * counts as inside a format when it sits between that format's markers.
 */
export function formatStateOf(view: EditorView): FormatState {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc.toString();
  const line = view.state.doc.lineAt(from);
  const around = marksIn(line.text, line.from).find((mark) => mark.from <= from && to <= mark.to);
  // A selection is judged by its edges; a bare cursor by whether its line has the format
  // open where it is, which is what typing into a chosen format leaves.
  const has = (kind: Inline) =>
    hasInline(doc, from, to, kind) || (from === to && cursorInside(line.text, from - line.from, kind));

  return {
    inline: {
      bold: has("bold"),
      italic: has("italic"),
      strike: has("strike"),
      code: has("code"),
    },
    block: blockOf(line.text),
    highlight: around?.semantic ?? null,
  };
}

/**
 * A block selected by clicking its ⋮⋮ handle, which opens the block's own menu — Turn
 * into among it — so the floating format bar is not raised for it as well. Both opened
 * together, one over the other (reported 2026-11-09).
 */
export const pickedByHandle = Annotation.define<true>();

/**
 * Where the floating format bar goes for the current selection, or `null` if there should
 * be none: nothing selected, or the editor not focused.
 */
export function barFor(view: EditorView): MenuAt | null {
  const { from, to, empty } = view.state.selection.main;

  if (empty || !view.hasFocus) {
    return null;
  }

  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);

  return start === null || end === null ? null : { left: start.left, top: end.bottom + 8, above: start.top - 8 };
}

/**
 * Notion's formatting shortcuts, so hands that know them need not learn others. ⌘⇧H, a
 * key concept highlight, is Notion's highlight shortcut too. Beside the commands they run,
 * so a shortcut and its command are changed together.
 */
export const formatKeys: readonly KeyBinding[] = [
  { key: "Mod-Shift-h", run: (target) => markSelection(target, "key") },
  { key: "Mod-b", run: (target) => formatInline(target, "bold") },
  { key: "Mod-i", run: (target) => formatInline(target, "italic") },
  { key: "Mod-Shift-s", run: (target) => formatInline(target, "strike") },
  { key: "Mod-e", run: (target) => formatInline(target, "code") },
  { key: "Mod-k", run: formatLink },
  { key: "Mod-Alt-1", run: (target) => formatBlock(target, "h1") },
  { key: "Mod-Alt-2", run: (target) => formatBlock(target, "h2") },
  { key: "Mod-Alt-3", run: (target) => formatBlock(target, "h3") },
  { key: "Mod-Alt-4", run: (target) => formatBlock(target, "task") },
  { key: "Mod-Alt-5", run: (target) => formatBlock(target, "bullet") },
  { key: "Mod-Alt-6", run: (target) => formatBlock(target, "numbered") },
];
