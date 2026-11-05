/**
 * Highlights in the notes, drawn: the words coloured in their meaning, and the `==` and
 * `{…}` around them hidden on every line but the cursor's.
 *
 * The words stay coloured on the cursor's line too, so a highlight being edited still
 * reads as one. Marks inside code — a fenced block or an inline span — are examples, not
 * highlights, and the syntax tree says which those are.
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";

import { marksIn } from "../marks";

const CODE = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText"]);

/** Whether `at` is inside code, by the syntax tree. */
function inCode(state: EditorState, at: number): boolean {
  let node = syntaxTree(state).resolveInner(at, 1);

  for (;;) {
    if (CODE.has(node.name)) {
      return true;
    }

    const parent = node.parent;

    if (parent === null) {
      return false;
    }

    node = parent;
  }
}

export function noteMarkDecorations(
  state: EditorState,
  active: ReadonlySet<number>,
  claimed: (from: number, to: number) => boolean,
): Range<Decoration>[] {
  const out: Range<Decoration>[] = [];

  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);

    for (const mark of marksIn(line.text, line.from)) {
      if (claimed(mark.from, mark.to) || inCode(state, mark.from)) {
        continue;
      }

      out.push(
        Decoration.mark({ class: "md-mark", attributes: { "data-semantic": mark.semantic } }).range(
          mark.innerFrom,
          mark.innerTo,
        ),
      );

      if (!active.has(number)) {
        out.push(Decoration.replace({}).range(mark.from, mark.innerFrom));
        out.push(Decoration.replace({}).range(mark.innerTo, mark.to));
      }
    }
  }

  return out;
}
