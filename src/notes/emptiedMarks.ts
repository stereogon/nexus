/**
 * Deleting all of a formatted text takes its formatting with it, as Notion does
 * (2026-11-07).
 *
 * The marks are hidden (`preview/markup.ts`, `preview/noteMarks.ts`), so selecting the words
 * one can see selects only what is between them. Deleted, that left the marks behind with
 * nothing inside: `===={exam}` showed as stray `==`, and emptied bold, `****`, read as a
 * divider. So a deletion that takes the whole of a construct's words is widened to take its
 * marks too. Typing over the words keeps the formatting, as Notion keeps it, so only a pure
 * deletion is widened.
 */
import { syntaxTree } from "@codemirror/language";
import { EditorState, type Extension, type Text } from "@codemirror/state";

import { marksIn } from "./marks";

/** A construct: its whole extent, and its words between the marks. */
interface Construct {
  readonly from: number;
  readonly to: number;
  readonly innerFrom: number;
  readonly innerTo: number;
}

const WRAPPED = new Set(["Emphasis", "StrongEmphasis", "Strikethrough", "InlineCode", "Link"]);
const MARK = new Set(["EmphasisMark", "StrikethroughMark", "CodeMark", "LinkMark"]);

/** The constructs touching `from`–`to`: highlights, and Markdown's inline formatting. */
function constructsNear(state: EditorState, from: number, to: number): Construct[] {
  const found: Construct[] = [];
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;

  for (let number = first; number <= last; number += 1) {
    const line = state.doc.line(number);

    found.push(...marksIn(line.text, line.from));
  }

  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (!WRAPPED.has(node.name)) {
        return true;
      }

      const marks: { from: number; to: number }[] = [];

      for (let child = node.node.firstChild; child !== null; child = child.nextSibling) {
        if (MARK.has(child.name)) {
          marks.push({ from: child.from, to: child.to });
        }
      }

      const opening = marks[0];
      // A link's words end at its second mark, `]`; the others' at their last.
      const closing = node.name === "Link" ? marks[1] : marks[marks.length - 1];

      if (opening !== undefined && closing !== undefined && closing !== opening) {
        found.push({ from: node.from, to: node.to, innerFrom: opening.to, innerTo: closing.from });
      }

      return true;
    },
  });

  return found;
}

/**
 * `from`–`to`, widened over every construct whose words it deletes entirely; again after
 * each widening, so emptied bold inside an emptied highlight goes with it.
 */
export function widenedDeletion(state: EditorState, from: number, to: number): { from: number; to: number } {
  let range = { from, to };

  for (;;) {
    const before = range;

    for (const construct of constructsNear(state, range.from, range.to)) {
      const emptied = construct.innerFrom < construct.innerTo && range.from <= construct.innerFrom && range.to >= construct.innerTo;

      if (emptied) {
        range = { from: Math.min(range.from, construct.from), to: Math.max(range.to, construct.to) };
      }
    }

    if (range.from === before.from && range.to === before.to) {
      return range;
    }
  }
}

/** Widens each pure deletion in a transaction over the constructs it empties. */
export const dropEmptiedMarks: Extension = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.docChanged || !transaction.isUserEvent("delete")) {
    return transaction;
  }

  const start = transaction.startState;
  const edits: { readonly from: number; readonly to: number; readonly insert: Text; readonly widened: boolean }[] = [];

  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
    const range = widenedDeletion(start, fromA, toA);

    edits.push({ ...range, insert, widened: range.from !== fromA || range.to !== toA });
  });

  if (!edits.some((edit) => edit.widened) || edits.some((edit) => edit.insert.length > 0)) {
    return transaction;
  }

  const changes = edits.map(({ from, to, insert }) => ({ from, to, insert }));
  const anchor = edits[0]?.from ?? 0;

  return { changes, selection: { anchor }, userEvent: "delete", scrollIntoView: true };
});
