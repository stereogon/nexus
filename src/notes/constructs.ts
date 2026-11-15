/**
 * The constructs whose marks the notes hide: highlights, coloured words, and Markdown's
 * inline formatting and links, each with its whole extent and the words between its marks. Shared by deleting
 * emptied formatting (`emptiedMarks.ts`) and by Enter splitting it (`enterKeys.ts`).
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

import { marksIn } from "./marks";
import { paintsIn } from "./paint";

/** A construct: its whole extent, and its words between the marks. */
export interface Construct {
  readonly from: number;
  readonly to: number;
  readonly innerFrom: number;
  readonly innerTo: number;
}

const WRAPPED = new Set(["Emphasis", "StrongEmphasis", "Strikethrough", "InlineCode", "Link"]);
const MARK = new Set(["EmphasisMark", "StrikethroughMark", "CodeMark", "LinkMark"]);

/** The constructs touching `from`–`to`: highlights, coloured words, and Markdown's inline formatting. */
export function constructsNear(state: EditorState, from: number, to: number): Construct[] {
  const found: Construct[] = [];
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;

  for (let number = first; number <= last; number += 1) {
    const line = state.doc.line(number);

    found.push(...marksIn(line.text, line.from), ...paintsIn(line.text, line.from));
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
