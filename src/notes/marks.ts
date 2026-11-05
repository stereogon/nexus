/**
 * Highlighting text in the notes, in the same four meanings as the document.
 *
 * Written `==text==` for a key concept — the common Markdown convention, so the default
 * form reads correctly in other apps — and `==text=={definition}`, `{exam}` or
 * `{question}` for the others. Chosen by the user on 2026-11-05 over a single colour:
 * the four meanings matter more here than the `{…}` other apps would show as text.
 *
 * Pure: finding marks in a line, and what wrapping, recolouring or removing one changes.
 * Which marks sit inside code is decided by the caller from the syntax tree.
 */
import type { HighlightSemantic } from "../ipc/annotations";

/** A mark as written: `==` + text (no space just inside either end) + `==` + optional meaning. */
const MARK = /==(?=\S)((?:(?!==).)*?\S)==(?:\{(key|definition|exam|question)\})?/g;

export interface NoteMark {
  readonly from: number;
  readonly to: number;
  readonly innerFrom: number;
  readonly innerTo: number;
  readonly semantic: HighlightSemantic;
}

/** The marks in one line, with offsets made absolute by `offset`. */
export function marksIn(line: string, offset = 0): NoteMark[] {
  return [...line.matchAll(MARK)].map((match) => {
    const from = offset + match.index;
    const inner = match[1] ?? "";
    const semantic = match[2];

    return {
      from,
      to: from + match[0].length,
      innerFrom: from + 2,
      innerTo: from + 2 + inner.length,
      semantic: semantic === "definition" || semantic === "exam" || semantic === "question" ? semantic : "key",
    };
  });
}

/** `text` marked as `semantic`, in the form `marksIn` reads back. */
export function marked(text: string, semantic: HighlightSemantic): string {
  return `==${text}==${semantic === "key" ? "" : `{${semantic}}`}`;
}

/** One edit to the document. */
export interface Change {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

/**
 * What marking `from`–`to` as `semantic` changes; `null` removes the mark it is in.
 *
 * Inside an existing mark, that mark is recoloured or removed, so picking a colour on
 * highlighted text never nests one highlight in another. Otherwise each line of the
 * selection is wrapped on its own, trimmed of the spaces at its ends — a mark cannot
 * cross a line, and `== text ==` with spaces inside is not one.
 */
export function markChanges(
  doc: string,
  from: number,
  to: number,
  semantic: HighlightSemantic | null,
): Change[] {
  const lineStart = doc.lastIndexOf("\n", from - 1) + 1;
  const lineEnd = doc.indexOf("\n", from) === -1 ? doc.length : doc.indexOf("\n", from);
  const around = marksIn(doc.slice(lineStart, lineEnd), lineStart).find(
    (mark) => mark.from <= from && to <= mark.to,
  );

  if (around !== undefined) {
    const inner = doc.slice(around.innerFrom, around.innerTo);

    return [{ from: around.from, to: around.to, insert: semantic === null ? inner : marked(inner, semantic) }];
  }

  if (semantic === null) {
    return [];
  }

  const changes: Change[] = [];
  let start = from;

  while (start < to) {
    const newline = doc.indexOf("\n", start);
    const end = newline === -1 || newline > to ? to : newline;
    const piece = doc.slice(start, end);
    const lead = piece.length - piece.trimStart().length;
    const body = piece.trim();

    if (body !== "") {
      changes.push({ from: start + lead, to: start + lead + body.length, insert: marked(body, semantic) });
    }

    start = end + 1;
  }

  return changes;
}
