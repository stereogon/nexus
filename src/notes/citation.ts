/**
 * The line "Link to Notes" inserts into `notes.md`.
 *
 * A twin of `lecture_core::citation_block`, which is the definition — the iPad will write
 * these lines too. Built here as well so the editor can insert one at the cursor without a
 * round trip, and held to the Rust version by `citation.test.ts` against the fixture Rust
 * writes, `fixtures/citations.json`. Change one and that test says so.
 */
import type { Annotation } from "../ipc/annotations";

/** The scheme every citation is written under. */
export const CITATION_SCHEME = "cite://";

/** The text an annotation quotes: the highlighted words, an area's caption, a box's text. */
function quoteOf(annotation: Annotation): string | null {
  switch (annotation.kind) {
    case "textHighlight":
      return annotation.quote;
    case "areaHighlight":
      return annotation.caption ?? null;
    case "textBox":
      return annotation.text;
  }
}

/** Backslash-escapes what would end the emphasis early, open code, or start a link. */
function escaped(quote: string): string {
  return quote.replace(/[\\*_`[\]<]/g, (character) => `\\${character}`);
}

export function citationBlock(annotation: Annotation): string {
  const link = `> 📌 **[Page ${String(annotation.page)}](${CITATION_SCHEME}${annotation.id})**`;
  const quote = quoteOf(annotation);

  return quote === null ? link : `${link}: *"${escaped(quote)}"*`;
}
