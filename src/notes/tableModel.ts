/**
 * A table in the notes as something to edit (2026-11-08): rows and columns added, removed
 * and moved, columns aligned, the header row turned off and on, and the whole written
 * back as a tidy GitHub-flavoured Markdown table.
 *
 * Asked for as "a proper table engine": until now a table could only be typed as pipes.
 * Pure, so every edit is tested without an editor; `preview/tableEditor.ts` draws a table
 * and turns what is done to it into these. Reading is `preview/table.ts`'s `parseTable`.
 *
 * GFM has no table without a header row, so "no header" is written as a header of empty
 * cells, which the editor does not draw. Turning the header on again promotes the first
 * row, so nothing typed is lost either way.
 */
import { COLUMN_WIDTH, widthsLine, type Alignment, type Table } from "./preview/table";

/** A table `rows` by `columns` (the header not counted), its header named and cells empty. */
export function blankTable(rows: number, columns: number): Table {
  return {
    header: Array.from({ length: columns }, (_, at) => `Column ${String(at + 1)}`),
    align: Array.from({ length: columns }, () => null),
    rows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => "")),
    widths: Array.from({ length: columns }, () => null),
  };
}

/** Whether the header row is drawn: a header of empty cells means none. */
export function hasHeader(table: Table): boolean {
  return table.header.some((cell) => cell.trim() !== "");
}

function delimiter(align: Alignment, width: number): string {
  const dashes = "-".repeat(Math.max(3, width) - (align === "center" ? 2 : align === null ? 0 : 1));

  switch (align) {
    case "left":
      return `:${dashes}`;
    case "center":
      return `:${dashes}:`;
    case "right":
      return `${dashes}:`;
    case null:
      return dashes;
  }
}

/**
 * `table` as GFM, each column padded to its widest cell so the text lines up too, under the
 * line recording its column widths when any was chosen.
 */
export function writeTable(table: Table): string {
  const escape = (cell: string) => cell.replace(/\|/g, "\\|");
  const all = [table.header, ...table.rows].map((row) => row.map(escape));
  const widths = table.header.map((_, at) => Math.max(3, ...all.map((row) => (row[at] ?? "").length)));
  const line = (cells: readonly string[]) => `| ${cells.map((cell, at) => cell.padEnd(widths[at] ?? 3)).join(" | ")} |`;
  const [head, ...body] = all;

  const widthsAbove = widthsLine(table.widths);

  return [
    ...(widthsAbove === null ? [] : [widthsAbove]),
    line(head ?? []),
    `| ${table.align.map((align, at) => delimiter(align, widths[at] ?? 3)).join(" | ")} |`,
    ...body.map(line),
  ].join("\n");
}

/** A cell's place: `row` -1 is the header. */
export interface Cell {
  readonly row: number;
  readonly column: number;
}

/** `table` with cell `at` reading `text`. */
export function withCell(table: Table, at: Cell, text: string): Table {
  const set = (cells: readonly string[]) => cells.map((cell, column) => (column === at.column ? text : cell));

  return at.row < 0
    ? { ...table, header: set(table.header) }
    : { ...table, rows: table.rows.map((cells, row) => (row === at.row ? set(cells) : cells)) };
}

/** `table` with an empty row inserted before body row `at` (its length to append). */
export function withRow(table: Table, at: number): Table {
  const rows = [...table.rows];

  rows.splice(Math.max(0, Math.min(at, rows.length)), 0, table.header.map(() => ""));

  return { ...table, rows };
}

/** `table` without body row `at`. The last row can go: a header alone is still a table. */
export function withoutRow(table: Table, at: number): Table {
  return { ...table, rows: table.rows.filter((_, row) => row !== at) };
}

/** `table` with body row `at` moved by `by` (-1 up, 1 down), or as it was at an end. */
export function withRowMoved(table: Table, at: number, by: -1 | 1): Table {
  const to = at + by;
  const moving = table.rows[at];
  const other = table.rows[to];

  if (moving === undefined || other === undefined) {
    return table;
  }

  return { ...table, rows: table.rows.map((cells, row) => (row === at ? other : row === to ? moving : cells)) };
}

/** `table` with `change` applied to the header, the alignments, the widths and every row alike. */
function eachRow(table: Table, change: <T>(cells: readonly T[]) => T[]): Table {
  return {
    header: change(table.header),
    align: change(table.align),
    rows: table.rows.map((cells) => change(cells)),
    widths: change(table.widths),
  };
}

/** `table` with a column inserted before column `at` (its width to append). */
export function withColumn(table: Table, at: number): Table {
  const place = Math.max(0, Math.min(at, table.header.length));
  const inserted = <T>(cells: readonly T[], fill: T): T[] => {
    const copy = [...cells];

    copy.splice(place, 0, fill);
    return copy;
  };

  return {
    // A table without a header keeps none: the new column's header is empty too.
    header: inserted(table.header, hasHeader(table) ? `Column ${String(table.header.length + 1)}` : ""),
    align: inserted<Alignment>(table.align, null),
    rows: table.rows.map((cells) => inserted(cells, "")),
    widths: inserted<number | null>(table.widths, null),
  };
}

/** `table` without column `at`, unless it is the last column, which a table cannot lose. */
export function withoutColumn(table: Table, at: number): Table {
  if (table.header.length <= 1) {
    return table;
  }

  return eachRow(table, (cells) => cells.filter((_, column) => column !== at));
}

/** `table` with column `at` moved by `by` (-1 left, 1 right), or as it was at an end. */
export function withColumnMoved(table: Table, at: number, by: -1 | 1): Table {
  const to = at + by;

  if (to < 0 || to >= table.header.length || at < 0 || at >= table.header.length) {
    return table;
  }

  return eachRow(table, (cells) => {
    // Compared with `undefined`, not with `??`: an alignment may rightly be `null`.
    const moving = cells[at];
    const other = cells[to];

    return cells.map((cell, column) =>
      column === at && other !== undefined ? other : column === to && moving !== undefined ? moving : cell,
    );
  });
}

/** `table` with column `at` aligned `align`. */
export function withAlignment(table: Table, at: number, align: Alignment): Table {
  return { ...table, align: table.align.map((old, column) => (column === at ? align : old)) };
}

/** `table` with column `at` `width` pixels wide, held to what a column can be, or fitting its words with `null`. */
export function withWidth(table: Table, at: number, width: number | null): Table {
  const held = width === null ? null : Math.round(Math.min(COLUMN_WIDTH.max, Math.max(COLUMN_WIDTH.min, width)));

  return { ...table, widths: table.widths.map((old, column) => (column === at ? held : old)) };
}

/** `table` with its header row turned off (moved into the body) or on (the first row promoted). */
export function withHeaderToggled(table: Table): Table {
  if (hasHeader(table)) {
    return { ...table, header: table.header.map(() => ""), rows: [table.header, ...table.rows] };
  }

  const [first, ...rest] = table.rows;

  return first === undefined
    ? { ...table, header: table.header.map((_, at) => `Column ${String(at + 1)}`) }
    : { ...table, header: first, rows: rest };
}
