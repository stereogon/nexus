/**
 * Deleting inside a highlight keeps it a highlight (2026-11-14).
 *
 * A highlight's words may not start or end with a space — `== a ==` is not one, in Nexus or
 * in the other apps that read `==` — so deleting the `?` from `==is it ?==` left `==is it ==`,
 * no longer a highlight, and its marks showed as text (reported with a screenshot). The words
 * kept as they are seen, the space that would now touch the marks is moved outside them:
 * `==is it== `. Typing a space at the end is left alone, since the next letter makes the
 * highlight whole again, and a change at several places at once is left to CodeMirror.
 */
import { EditorState, type Extension } from "@codemirror/state";

import { marksIn } from "./marks";
import { inCode } from "./preview/noteMarks";

/** `from`–`to` deleted, with a highlight it would break mended; `null` when none would break. */
export function mendedDeletion(state: EditorState, from: number, to: number): { from: number; to: number; insert: string; anchor: number } | null {
  const line = state.doc.lineAt(from);
  const mark = marksIn(line.text, line.from).find((found) => found.innerFrom <= from && to <= found.innerTo);

  if (mark === undefined || to > line.to || inCode(state, mark.from)) {
    return null;
  }

  const inner = state.doc.sliceString(mark.innerFrom, mark.innerTo);
  const left = inner.slice(0, from - mark.innerFrom) + inner.slice(to - mark.innerFrom);
  const words = left.trim();

  if (words === "" || words === left) {
    return null;
  }

  const lead = left.length - left.trimStart().length;
  const meaning = state.doc.sliceString(mark.innerTo + 2, mark.to);
  const insert = `${left.slice(0, lead)}==${words}==${meaning}${left.slice(lead + words.length)}`;
  const at = Math.min(Math.max(from - mark.innerFrom - lead, 0), words.length);

  return { from: mark.from, to: mark.to, insert, anchor: mark.from + lead + 2 + at };
}

/** Mends a single deletion that would break the highlight it is in. */
export const keepMarksWhole: Extension = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.docChanged || !transaction.isUserEvent("delete")) {
    return transaction;
  }

  const changes: { from: number; to: number; inserted: number }[] = [];

  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
    changes.push({ from: fromA, to: toA, inserted: insert.length });
  });

  const only = changes.length === 1 && changes[0]?.inserted === 0 ? changes[0] : undefined;
  const mended = only === undefined ? null : mendedDeletion(transaction.startState, only.from, only.to);

  if (mended === null) {
    return transaction;
  }

  return { changes: { from: mended.from, to: mended.to, insert: mended.insert }, selection: { anchor: mended.anchor }, userEvent: "delete", scrollIntoView: true };
});
