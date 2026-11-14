/**
 * Finding what in the notes can be shown rendered.
 *
 * The notes are edited as Markdown text, and each construct here is drawn in place of its
 * source while the cursor is elsewhere — a "live preview" — then shown as text again the
 * moment the cursor enters it, so nothing is ever uneditable. This module only *finds*
 * them; `field.ts` decides what to draw.
 *
 * Pure and line-based, like the Rust citation scanner, for the same reason: fenced code is
 * an example, not content, so nothing inside a fence is rendered unless the fence itself is
 * a `mermaid` or `chart` block. Inline code spans are skipped the same way.
 *
 * Inline maths follows Pandoc's rule: `$…$` only when the opening `$` is followed by a
 * non-space and the closing one preceded by one, and not followed by a digit. That is what
 * keeps "it costs $5 and $6" from becoming maths.
 */

import { PAGE_LINK_LINE, unescapedTitle } from "../pageLinks";

export type Preview =
  | {
      readonly kind: "citation";
      readonly from: number;
      readonly to: number;
      readonly page: number;
      readonly id: string;
      readonly quote: string | null;
    }
  | { readonly kind: "math"; readonly from: number; readonly to: number; readonly tex: string; readonly display: boolean }
  | { readonly kind: "mermaid" | "chart"; readonly from: number; readonly to: number; readonly source: string }
  | { readonly kind: "image"; readonly from: number; readonly to: number; readonly alt: string; readonly src: string }
  | { readonly kind: "page"; readonly from: number; readonly to: number; readonly id: string; readonly title: string };

/** The citation line `lecture_core::citation_block` writes; see `notes/citation.ts`. */
const CITATION = /^> 📌 \*\*\[Page (\d+)\]\(cite:\/\/([A-Za-z0-9_-]+)\)\*\*(?:: \*"(.*)"\*)?\s*$/u;

/** Whether a line is a citation, which the notes draw as one element. */
export function isCitationLine(line: string): boolean {
  return CITATION.test(line);
}
const FENCE = /^(`{3,}|~{3,})\s*([\w-]*)/;
/**
 * `![alt](path)`, with the optional title CommonMark allows after the path —
 * `"…"`, `'…'` or `(…)` — and an optional `<…>` around a path with spaces. Missing the
 * title was why `![alt](/image/x.svg "A title")` was left as raw text (2026-11-05).
 */
const IMAGE = /!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const INLINE_MATH = /(?<![\\$])\$(?=\S)((?:[^$\\\n]|\\.)+?)(?<=\S)\$(?![$\d])/g;

/** The quote as written, with the escaping `citation_block` added taken off again. */
function unescaped(quote: string): string {
  return quote.replace(/\\([\\*_`[\]<])/g, "$1");
}

/** `line` with inline code spans blanked out, keeping every offset where it was. */
function withoutCode(line: string): string {
  return line.replace(/(`+)[^`]*?\1/g, (span) => " ".repeat(span.length));
}

export function findPreviews(doc: string): Preview[] {
  const found: Preview[] = [];
  const lines = doc.split("\n");
  let offset = 0;
  let fence: { marker: string; kind: string; from: number; body: string[] } | null = null;
  let math: { from: number; body: string[] } | null = null;

  for (const line of lines) {
    const from = offset;
    const to = offset + line.length;

    offset = to + 1;

    if (fence !== null) {
      if (line.trim().startsWith(fence.marker) && line.trim().replace(/[`~]/g, "") === "") {
        if (fence.kind === "mermaid" || fence.kind === "chart") {
          found.push({ kind: fence.kind, from: fence.from, to, source: fence.body.join("\n") });
        }
        fence = null;
      } else {
        fence.body.push(line);
      }
      continue;
    }

    if (math !== null) {
      if (line.trim() === "$$") {
        found.push({ kind: "math", from: math.from, to, tex: math.body.join("\n"), display: true });
        math = null;
      } else {
        math.body.push(line);
      }
      continue;
    }

    const opened = FENCE.exec(line);

    if (opened?.[1] !== undefined) {
      fence = { marker: opened[1], kind: (opened[2] ?? "").toLowerCase(), from, body: [] };
      continue;
    }

    const trimmed = line.trim();

    if (trimmed === "$$") {
      math = { from, body: [] };
      continue;
    }

    const single = /^\$\$(.+)\$\$$/.exec(trimmed);

    if (single?.[1] !== undefined) {
      found.push({ kind: "math", from, to, tex: single[1].trim(), display: true });
      continue;
    }

    const citation = CITATION.exec(line);

    if (citation?.[1] !== undefined && citation[2] !== undefined) {
      found.push({
        kind: "citation",
        from,
        to,
        page: Number(citation[1]),
        id: citation[2],
        quote: citation[3] === undefined ? null : unescaped(citation[3]),
      });
      continue;
    }

    const linked = PAGE_LINK_LINE.exec(line);

    if (linked?.[1] !== undefined && linked[2] !== undefined) {
      found.push({ kind: "page", from, to, id: linked[2], title: unescapedTitle(linked[1]) });
      continue;
    }

    const prose = withoutCode(line);

    for (const match of prose.matchAll(IMAGE)) {
      found.push({
        kind: "image",
        from: from + match.index,
        to: from + match.index + match[0].length,
        alt: match[1] ?? "",
        src: (match[2] ?? "").replace(/^<(.*)>$/, "$1"),
      });
    }

    for (const match of prose.matchAll(INLINE_MATH)) {
      found.push({
        kind: "math",
        from: from + match.index,
        to: from + match.index + match[0].length,
        tex: match[1] ?? "",
        display: false,
      });
    }
  }

  return found.sort((a, b) => a.from - b.from);
}
