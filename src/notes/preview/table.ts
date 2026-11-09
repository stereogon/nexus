/**
 * Reading a GitHub-style Markdown table, and drawing a cell's words. The table itself is
 * drawn and edited by `tableEditor.ts` (2026-11-08); it was a read-only drawing before.
 *
 * Cells are built as DOM nodes, never as an HTML string, so the text of a cell can only
 * ever be text. Inside a cell, `**bold**`, `*italic*`, `_italic_`, `~~struck~~` and `` `code` `` are
 * drawn; anything richer shows as written, which is the honest fallback for a cell.
 *
 * GFM has nowhere to keep a column's width, so a width dragged in the editor (2026-11-09) is
 * kept in a comment on the line just above the table, `<!-- column widths: 180 auto -->`,
 * in pixels or `auto`. Other Markdown readers hide a comment, and the table stays a table.
 */
import type { Text } from "@codemirror/state";

export type Alignment = "left" | "center" | "right" | null;

export interface Table {
  readonly header: readonly string[];
  readonly align: readonly Alignment[];
  readonly rows: readonly (readonly string[])[];
  /** Each column's width in pixels, `null` to fit its words. */
  readonly widths: readonly (number | null)[];
}

/** The narrowest and widest a column can be dragged to: the narrowest is the cells' `min-width` in `tableEditor.css`. */
export const COLUMN_WIDTH = { min: 72, max: 1600 } as const;

const WIDTHS_LINE = /^<!--\s*column widths:([^>]*)-->\s*$/;

/** The widths on a `<!-- column widths: … -->` line, or `null` if it is not one. */
function widthsOf(line: string): (number | null)[] | null {
  const words = WIDTHS_LINE.exec(line.trim())?.[1]?.trim().split(/\s+/);

  return (
    words?.map((word) => {
      const width = Number(word);

      return /^\d+$/.test(word) ? Math.min(COLUMN_WIDTH.max, Math.max(COLUMN_WIDTH.min, width)) : null;
    }) ?? null
  );
}

/** Where the table whose rows start at `from` begins: its widths line, if it has one. */
export function tableStart(doc: Text, from: number): number {
  const line = doc.lineAt(from);
  const above = line.number > 1 ? doc.line(line.number - 1) : null;

  return above !== null && widthsOf(above.text) !== null ? above.from : from;
}

/** The line that records `widths`, or `null` when every column fits its words. */
export function widthsLine(widths: readonly (number | null)[]): string | null {
  return widths.some((width) => width !== null)
    ? `<!-- column widths: ${widths.map((width) => (width === null ? "auto" : String(width))).join(" ")} -->`
    : null;
}

/** The cells of one `| a | b |` row, with escaped pipes kept as text. */
export function cellsOf(row: string): string[] {
  const inner = row.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");

  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function alignmentOf(delimiter: string): Alignment {
  const left = delimiter.startsWith(":");
  const right = delimiter.endsWith(":");

  return left && right ? "center" : right ? "right" : left ? "left" : null;
}

/** The table in `source`, its widths line first if it has one, or `null` if it has no delimiter row. */
export function parseTable(source: string): Table | null {
  const lines = source.split("\n").filter((line) => line.trim() !== "");
  const recorded = lines[0] === undefined ? null : widthsOf(lines[0]);
  const [head, delimiter, ...body] = recorded === null ? lines : lines.slice(1);

  if (head === undefined || delimiter === undefined || !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(delimiter)) {
    return null;
  }

  const header = cellsOf(head);
  const align = cellsOf(delimiter).map(alignmentOf);
  // Every row as wide as the header: GFM pads short rows and drops extra cells.
  const rows = body.map((line) => header.map((_, at) => cellsOf(line)[at] ?? ""));

  const widths = header.map((_, at) => recorded?.[at] ?? null);

  return { header, align, rows, widths };
}

/** Appends `text` to `parent`, drawing bold, italic, strikethrough and code spans as elements. */
export function appendInline(parent: HTMLElement, text: string): void {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;

  for (const match of text.matchAll(pattern)) {
    const token = match[0];

    parent.append(text.slice(last, match.index));

    const [tag, inner] = token.startsWith("`")
      ? ["code", token.slice(1, -1)]
      : token.startsWith("**")
        ? ["strong", token.slice(2, -2)]
        : token.startsWith("~~")
          ? ["s", token.slice(2, -2)]
          : ["em", token.slice(1, -1)];
    const element = document.createElement(tag);

    // Formats inside one another — bold italic, as the format bar makes — drawn nested;
    // code's words are literal.
    if (tag === "code") {
      element.textContent = inner;
    } else {
      appendInline(element, inner);
    }

    parent.append(element);
    last = match.index + token.length;
  }

  parent.append(text.slice(last));
}
