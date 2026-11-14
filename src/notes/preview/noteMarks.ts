/**
 * Highlights in the notes, drawn: the words coloured in their meaning, and the `==` and
 * `{…}` around them hidden — on the cursor's line too, as every other mark is since
 * 2026-11-07 (reported the same day: `==ijjojok=={exam}` still showed there). The meaning is
 * changed or removed from the format bar, so the marks never need to be typed into. Marks
 * inside code — a fenced block or an inline span — are examples, not
 * highlights, and the syntax tree says which those are.
 *
 * The closing marks are drawn as the meaning's letter, K, D, E or Q, in its colour, just
 * after the words — where the document puts its badge (`highlightBadge.ts`), so the two read
 * alike and the four can be told apart without relying on hue, as §3 asks (2026-11-14).
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";

import type { HighlightSemantic } from "../../ipc/annotations";
import { SEMANTIC_GLYPH, SEMANTIC_LABEL } from "../../ui/semantics";
import { marksIn } from "../marks";

const CODE = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText"]);

/** The meaning's letter after a highlight's words. */
class MarkGlyphWidget extends WidgetType {
  constructor(readonly semantic: HighlightSemantic) {
    super();
  }

  override eq(other: MarkGlyphWidget): boolean {
    return other.semantic === this.semantic;
  }

  override toDOM(): HTMLElement {
    const glyph = document.createElement("span");

    glyph.className = "md-mark-glyph";
    glyph.dataset["semantic"] = this.semantic;
    glyph.title = SEMANTIC_LABEL[this.semantic];
    // Drawn by `::after` from the attribute, so it is not text: copying the line, or reading
    // it back, gives the words alone.
    glyph.dataset["glyph"] = SEMANTIC_GLYPH[this.semantic];

    return glyph;
  }
}

/** Whether `at` is inside code, by the syntax tree. */
export function inCode(state: EditorState, at: number): boolean {
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

      out.push(Decoration.replace({}).range(mark.from, mark.innerFrom));
      out.push(Decoration.replace({ widget: new MarkGlyphWidget(mark.semantic) }).range(mark.innerTo, mark.to));
    }
  }

  return out;
}
