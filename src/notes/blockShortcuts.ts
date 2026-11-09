/**
 * Notion's block shortcuts (2026-11-09): ⌘D duplicates the block, ⌘⇧↑ and ⌘⇧↓ move it past
 * the one above or below, ⌘⌥0 turns it back into text. With several lines selected, they
 * act on every block the selection touches, as Notion acts on a multi-block selection.
 *
 * A block is what `blocks.ts` says one is: a line, or a whole code block or table. Moves
 * are one change swapping two runs of lines, so undo takes a move back in one step.
 */
import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";

import { blockAt, type Block } from "./blocks";
import { formatBlock } from "./markSelection";

/** The lines of every block the selection touches. */
export function selectedBlocks(state: EditorState): Block {
  const doc = state.doc.toString();
  const { from, to } = state.selection.main;

  return {
    from: blockAt(doc, state.doc.lineAt(from).number).from,
    to: blockAt(doc, state.doc.lineAt(to).number).to,
  };
}

function duplicate(view: EditorView): boolean {
  const { state } = view;
  const blocks = selectedBlocks(state);
  const start = state.doc.line(blocks.from).from;
  const end = state.doc.line(blocks.to).to;
  const text = state.sliceDoc(start, end);
  const offset = text.length + 1;
  const { anchor, head } = state.selection.main;

  // The copy goes below, and the cursor with it, where it was in the original.
  view.dispatch({ changes: { from: end, insert: `\n${text}` }, selection: { anchor: anchor + offset, head: head + offset }, scrollIntoView: true });

  return true;
}

/** The selected blocks moved past the block above (`-1`) or below (`1`), in one change. */
export function moveChange(state: EditorState, by: -1 | 1): { from: number; to: number; insert: string; shift: number } | null {
  const doc = state.doc.toString();
  const blocks = selectedBlocks(state);

  if (by < 0 ? blocks.from === 1 : blocks.to === state.doc.lines) {
    return null;
  }

  const other = blockAt(doc, by < 0 ? blocks.from - 1 : blocks.to + 1);
  const moving = state.sliceDoc(state.doc.line(blocks.from).from, state.doc.line(blocks.to).to);
  const passed = state.sliceDoc(state.doc.line(other.from).from, state.doc.line(other.to).to);
  const top = by < 0 ? other : blocks;
  const from = state.doc.line(top.from).from;
  const to = state.doc.line(by < 0 ? blocks.to : other.to).to;

  return {
    from,
    to,
    insert: by < 0 ? `${moving}\n${passed}` : `${passed}\n${moving}`,
    shift: (passed.length + 1) * by,
  };
}

function move(by: -1 | 1) {
  return (view: EditorView): boolean => {
    const change = moveChange(view.state, by);

    // At the top or the bottom, the keys are still the move's, so the selection does not
    // stretch to the end of the notes instead.
    if (change !== null) {
      const { anchor, head } = view.state.selection.main;

      view.dispatch({
        changes: { from: change.from, to: change.to, insert: change.insert },
        selection: { anchor: anchor + change.shift, head: head + change.shift },
        scrollIntoView: true,
        userEvent: "move.line",
      });
    }

    return true;
  };
}

/** Ahead of the default keys, where ⌘⇧↑ and ⌘⇧↓ would select to the ends of the notes. */
export const blockShortcuts: Extension = Prec.high(
  keymap.of([
    { key: "Mod-d", run: duplicate },
    { key: "Mod-Shift-ArrowUp", run: move(-1) },
    { key: "Mod-Shift-ArrowDown", run: move(1) },
    { key: "Mod-Alt-0", run: (view) => formatBlock(view, "paragraph") },
  ]),
);
