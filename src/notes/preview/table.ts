/**
 * Reading a GitHub-style Markdown table, and drawing a cell's words. The table itself is
 * drawn and edited by `tableEditor.ts` (2026-11-08); it was a read-only drawing before.
 *
 * Cells are built as DOM nodes, never as an HTML string, so the text of a cell can only
 * ever be text. Inside a cell, `**bold**`, `*italic*`, `_italic_` and `` `code` `` are
 * drawn; anything richer shows as written, which is the honest fallback for a cell.
 */
export type Alignment = "left" | "center" | "right" | null;

export interface Table {
  readonly header: readonly string[];
  readonly align: readonly Alignment[];
  readonly rows: readonly (readonly string[])[];
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

/** The table in `source`, or `null` if its second line is not a delimiter row. */
export function parseTable(source: string): Table | null {
  const [head, delimiter, ...body] = source.split("\n").filter((line) => line.trim() !== "");

  if (head === undefined || delimiter === undefined || !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(delimiter)) {
    return null;
  }

  const header = cellsOf(head);
  const align = cellsOf(delimiter).map(alignmentOf);
  // Every row as wide as the header: GFM pads short rows and drops extra cells.
  const rows = body.map((line) => header.map((_, at) => cellsOf(line)[at] ?? ""));

  return { header, align, rows };
}

/** Appends `text` to `parent`, drawing bold, italic and code spans as elements. */
export function appendInline(parent: HTMLElement, text: string): void {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;

  for (const match of text.matchAll(pattern)) {
    const token = match[0];

    parent.append(text.slice(last, match.index));

    const [tag, inner] = token.startsWith("`")
      ? ["code", token.slice(1, -1)]
      : token.startsWith("**")
        ? ["strong", token.slice(2, -2)]
        : ["em", token.slice(1, -1)];
    const element = document.createElement(tag);

    element.textContent = inner;
    parent.append(element);
    last = match.index + token.length;
  }

  parent.append(text.slice(last));
}
