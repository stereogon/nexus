/**
 * Enter in formatted words (2026-11-13).
 *
 * The marks are hidden, so the end of bold words and the place after their closing `**` look
 * the same, and typing into a chosen format leaves the cursor before the closing marks. Enter
 * there broke the line between the words and their marks, and the `**` went down to the next
 * line. So Enter at the end of a construct's words — bold, italic, strikethrough, code, a link
 * or a highlight — steps out of it first, at the start steps out in front, and in the middle
 * closes it before the new line and opens it again after, as Notion splits bold words into
 * two bold lines. The new line itself is still Markdown's own Enter, which continues a list
 * or a quote; this only decides where it goes.
 */
import { insertNewlineAndIndent } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { Prec, type EditorState, type Extension, type StateCommand, type Transaction } from "@codemirror/state";
import { keymap } from "@codemirror/view";

import { constructsNear } from "./constructs";

/** Where Enter at `head` puts the new line, and the marks closed before it and opened after it. */
export function enterSplit(state: EditorState, head: number): { at: number; close: string; open: string } {
  // Code is written as it is: nothing in it is formatting.
  for (let node = syntaxTree(state).resolveInner(head, -1); node.parent !== null; node = node.parent) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") {
      return { at: head, close: "", open: "" };
    }
  }

  // Innermost first: a construct inside another lies within its words, so is the shorter.
  const around = constructsNear(state, head, head)
    .filter((construct) => construct.from < head && head < construct.to)
    .sort((a, b) => a.to - a.from - (b.to - b.from));
  let at = head;

  for (const [index, construct] of around.entries()) {
    if (at >= construct.innerTo) {
      at = construct.to;
    } else if (at <= construct.innerFrom) {
      at = construct.from;
    } else {
      // Within its words, and so within every construct outside it: all of them split.
      const split = around.slice(index);

      return {
        at,
        close: split.map((outer) => state.sliceDoc(outer.innerTo, outer.to)).join(""),
        open: split
          .reverse()
          .map((outer) => state.sliceDoc(outer.from, outer.innerFrom))
          .join(""),
      };
    }
  }

  return { at, close: "", open: "" };
}

/** Enter with the cursor in formatted words; anything else is left to Markdown's Enter. */
export const enterInFormat: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;

  if (!range.empty || state.selection.ranges.length > 1) {
    return false;
  }

  const { at, close, open } = enterSplit(state, range.head);

  if (at === range.head && close === "") {
    return false;
  }

  const moved = state.update({ changes: { from: at, insert: close + open }, selection: { anchor: at + close.length } });
  const made: Transaction[] = [];
  const target = { state: moved.state, dispatch: (line: Transaction) => made.push(line) };
  const line = insertNewlineContinueMarkup(target) || insertNewlineAndIndent(target) ? made[0] : undefined;

  if (line === undefined) {
    return false;
  }

  // One change, so one ⌘Z takes the new line and the marks back together; the cursor in
  // the words opened again, so typing goes on in their format.
  dispatch(
    state.update({
      changes: moved.changes.compose(line.changes),
      selection: { anchor: line.newSelection.main.head + open.length },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );

  return true;
};

/** Ahead of Markdown's own Enter, which is itself above the defaults. */
export const enterKeys: Extension = Prec.highest(keymap.of([{ key: "Enter", run: enterInFormat }]));
