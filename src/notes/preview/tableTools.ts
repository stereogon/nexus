/**
 * The toolbar above a table being edited (2026-11-08): rows and columns added, moved and
 * removed around the cell in use, the column aligned, the header row turned off and on,
 * the table deleted. Shown while focus is in the table. It only names the edits; the table
 * widget (`tableEditor.ts`) applies them, passed in as `apply`.
 */
import type { Alignment, Table } from "./table";
import {
  hasHeader,
  withAlignment,
  withColumn,
  withColumnMoved,
  withHeaderToggled,
  withoutColumn,
  withoutRow,
  withRow,
  withRowMoved,
  type Cell,
} from "../tableModel";

/** An edit: the new table (or `null` to delete it), and the cell to be in afterwards. */
export type TableEdit = (table: Table, at: Cell) => { readonly table: Table | null; readonly focus: Cell | null };

interface Tool {
  readonly label: string;
  readonly icon: string;
  readonly edit: TableEdit;
}

/** The icons, drawn on a 16px grid in the window's one stroke weight (`ui/icons.tsx`). */
const ICONS = {
  rows: "M2.5 3.5h11v9h-11zM2.5 6.5h11M2.5 9.5h11",
  columns: "M2.5 3.5h11v9h-11zM6.2 3.5v9M9.8 3.5v9",
  rowAbove: "M3 9h10v3.5H3zM8 2.5v4.5M5.75 4.75h4.5",
  rowBelow: "M3 3.5h10V7H3zM8 9v4.5M5.75 11.25h4.5",
  up: "M8 13V3M4.5 6.5 8 3l3.5 3.5",
  down: "M8 3v10M4.5 9.5 8 13l3.5-3.5",
  rowDelete: "M3 5.5h10v5H3zM6 8h4",
  columnLeft: "M9 3h3.5v10H9zM2.5 8H7M4.75 5.75v4.5",
  columnRight: "M3.5 3H7v10H3.5zM9 8h4.5M11.25 5.75v4.5",
  left: "M13 8H3M6.5 4.5 3 8l3.5 3.5",
  right: "M3 8h10M9.5 4.5 13 8l-3.5 3.5",
  columnDelete: "M5.5 3h5v10h-5zM6.75 8h2.5",
  alignLeft: "M3 4h10M3 8h6M3 12h8",
  alignCenter: "M3 4h10M5 8h6M4 12h8",
  alignRight: "M3 4h10M7 8h6M5 12h8",
  header: "M2.5 3.5h11v9h-11zM2.5 6.5h11M6.5 6.5v6M10 6.5v6",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5",
  chevron: "M5 6.5 8 9.5l3-3",
} as const;

const align = (alignment: Alignment): TableEdit => (table, at) => ({ table: withAlignment(table, at.column, alignment), focus: at });

/** A body row to act on: the header row has none, so its first body row stands in. */
const bodyRow = (at: Cell) => Math.max(0, at.row);

const ROW: readonly Tool[] = [
  { label: "Add a row above", icon: ICONS.rowAbove, edit: (table, at) => ({ table: withRow(table, bodyRow(at)), focus: { row: bodyRow(at), column: at.column } }) },
  { label: "Add a row below", icon: ICONS.rowBelow, edit: (table, at) => ({ table: withRow(table, at.row + 1), focus: { row: at.row + 1, column: at.column } }) },
  { label: "Move the row up", icon: ICONS.up, edit: (table, at) => ({ table: withRowMoved(table, at.row, -1), focus: { row: Math.max(0, at.row - 1), column: at.column } }) },
  { label: "Move the row down", icon: ICONS.down, edit: (table, at) => ({ table: withRowMoved(table, at.row, 1), focus: { row: Math.min(table.rows.length - 1, at.row + 1), column: at.column } }) },
  { label: "Delete the row", icon: ICONS.rowDelete, edit: (table, at) => ({ table: at.row < 0 ? table : withoutRow(table, at.row), focus: { row: Math.min(at.row, table.rows.length - 2), column: at.column } }) },
];

const COLUMN: readonly Tool[] = [
  { label: "Add a column to the left", icon: ICONS.columnLeft, edit: (table, at) => ({ table: withColumn(table, at.column), focus: at }) },
  { label: "Add a column to the right", icon: ICONS.columnRight, edit: (table, at) => ({ table: withColumn(table, at.column + 1), focus: { row: at.row, column: at.column + 1 } }) },
  { label: "Move the column left", icon: ICONS.left, edit: (table, at) => ({ table: withColumnMoved(table, at.column, -1), focus: { row: at.row, column: Math.max(0, at.column - 1) } }) },
  { label: "Move the column right", icon: ICONS.right, edit: (table, at) => ({ table: withColumnMoved(table, at.column, 1), focus: { row: at.row, column: Math.min(table.header.length - 1, at.column + 1) } }) },
  { label: "Delete the column", icon: ICONS.columnDelete, edit: (table, at) => ({ table: withoutColumn(table, at.column), focus: { row: at.row, column: Math.max(0, at.column - 1) } }) },
];

const ALIGN: readonly Tool[] = [
  { label: "Align the column left", icon: ICONS.alignLeft, edit: align("left") },
  { label: "Centre the column", icon: ICONS.alignCenter, edit: align("center") },
  { label: "Align the column right", icon: ICONS.alignRight, edit: align("right") },
];

const headerToggle: TableEdit = (table, at) => {
  const toggled = withHeaderToggled(table);

  return { table: toggled, focus: { row: hasHeader(toggled) ? -1 : 0, column: at.column } };
};

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const attributes = { viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };

  for (const [name, value] of Object.entries(attributes)) {
    svg.setAttribute(name, value);
  }

  stroke.setAttribute("d", path);
  svg.append(stroke);

  return svg;
}

/** An icon button that keeps focus in the cell, so the edit is about the cell in use. */
function button(label: string, content: SVGSVGElement[], onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");

  element.type = "button";
  element.title = label;
  element.setAttribute("aria-label", label);
  element.append(...content);
  element.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  element.addEventListener("click", onClick);

  return element;
}

/** Closes every option strip in `bar`. */
export function closeAll(bar: Element): void {
  for (const strip of bar.querySelectorAll<HTMLElement>(".md-table-menu")) {
    strip.hidden = true;
  }

  for (const opener of bar.querySelectorAll<HTMLElement>("[aria-haspopup]")) {
    opener.setAttribute("aria-expanded", "false");
  }
}

/**
 * An icon that opens a strip of option icons just above it, as editors offer many options
 * in little room; below it instead when the window has no room above.
 */
function options(label: string, shown: string, tools: readonly Tool[], apply: (edit: TableEdit) => void, bar: HTMLElement): HTMLElement {
  const holder = document.createElement("span");
  const strip = document.createElement("div");
  const opener = button(label, [icon(shown), icon(ICONS.chevron)], () => {
    const opening = strip.hidden;

    closeAll(bar);
    strip.hidden = !opening;
    opener.setAttribute("aria-expanded", String(opening));

    if (opening) {
      const room = opener.getBoundingClientRect().top;

      strip.classList.toggle("below", room < strip.offsetHeight + 12);
    }
  });

  holder.className = "md-table-menu-holder";
  opener.className = "md-table-menu-opener";
  opener.setAttribute("aria-haspopup", "menu");
  opener.setAttribute("aria-expanded", "false");
  strip.className = "md-table-menu";
  strip.setAttribute("role", "menu");
  strip.setAttribute("aria-label", label);
  strip.setAttribute("aria-orientation", "horizontal");
  strip.hidden = true;

  for (const tool of tools) {
    const item = button(tool.label, [icon(tool.icon)], () => {
      closeAll(bar);
      apply(tool.edit);
    });

    item.setAttribute("role", "menuitem");
    strip.append(item);
  }

  holder.append(opener, strip);

  return holder;
}

/** The alignment icon for `alignment`, as the Alignment button shows the column's own. */
function alignmentIcon(alignment: Alignment): string {
  return alignment === "center" ? ICONS.alignCenter : alignment === "right" ? ICONS.alignRight : ICONS.alignLeft;
}

/**
 * The toolbar's element: icons only, each group's options in a strip that opens above its
 * icon (2026-11-08: text buttons wrapped onto three rows and covered the words above).
 * `apply` performs an edit on the table it sits on; `alignment` is the column in use's.
 */
export function tableTools(apply: (edit: TableEdit) => void, header: boolean, alignment: Alignment): HTMLElement {
  const bar = document.createElement("div");
  const divider = () => {
    const line = document.createElement("span");

    line.className = "md-table-tools-divider";
    return line;
  };
  const headerButton = button("Header row", [icon(ICONS.header)], () => {
    apply(headerToggle);
  });

  bar.className = "md-table-tools";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Table");
  headerButton.setAttribute("aria-pressed", String(header));

  bar.append(
    options("Rows", ICONS.rows, ROW, apply, bar),
    options("Columns", ICONS.columns, COLUMN, apply, bar),
    divider(),
    options("Alignment", alignmentIcon(alignment), ALIGN, apply, bar),
    divider(),
    headerButton,
    button("Delete the table", [icon(ICONS.trash)], () => {
      apply(() => ({ table: null, focus: null }));
    }),
  );
  return bar;
}

/** Shows `alignment` on the toolbar's Alignment icon, as the cell in use changes column. */
export function showAlignment(bar: Element | null, alignment: Alignment): void {
  bar?.querySelector('[aria-label="Alignment"] path')?.setAttribute("d", alignmentIcon(alignment));
}
