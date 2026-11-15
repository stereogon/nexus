/**
 * Coloured words in the notes (`notes/paint.ts`), drawn: the words in their colour or on it,
 * and the `<span …>` and `</span>` around them hidden, as a highlight's marks are. The
 * colours are `--paint-*` in `paint.css`, one set for light themes and one for dark.
 */
import type { EditorState, Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";

import { paintName, paintsIn } from "../paint";
import { inCode } from "./noteMarks";

export function paintDecorations(state: EditorState, claimed: (from: number, to: number) => boolean): Range<Decoration>[] {
  const out: Range<Decoration>[] = [];

  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);

    for (const span of paintsIn(line.text, line.from)) {
      if (claimed(span.from, span.to) || inCode(state, span.from)) {
        continue;
      }

      out.push(Decoration.mark({ class: "md-paint", attributes: { "data-paint": paintName(span.paint) } }).range(span.innerFrom, span.innerTo));
      out.push(Decoration.replace({}).range(span.from, span.innerFrom));
      out.push(Decoration.replace({}).range(span.innerTo, span.to));
    }
  }

  return out;
}
