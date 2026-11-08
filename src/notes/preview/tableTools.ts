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
  readonly edit: TableEdit;
}

const align = (alignment: Alignment): TableEdit => (table, at) => ({ table: withAlignment(table, at.column, alignment), focus: at });

/** A body row to act on: the header row has none, so its first body row stands in. */
const bodyRow = (at: Cell) => Math.max(0, at.row);

const ROW: readonly Tool[] = [
  { label: "Add a row above", edit: (table, at) => ({ table: withRow(table, bodyRow(at)), focus: { row: bodyRow(at), column: at.column } }) },
  { label: "Add a row below", edit: (table, at) => ({ table: withRow(table, at.row + 1), focus: { row: at.row + 1, column: at.column } }) },
  { label: "Move the row up", edit: (table, at) => ({ table: withRowMoved(table, at.row, -1), focus: { row: Math.max(0, at.row - 1), column: at.column } }) },
  { label: "Move the row down", edit: (table, at) => ({ table: withRowMoved(table, at.row, 1), focus: { row: Math.min(table.rows.length - 1, at.row + 1), column: at.column } }) },
  { label: "Delete the row", edit: (table, at) => ({ table: at.row < 0 ? table : withoutRow(table, at.row), focus: { row: Math.min(at.row, table.rows.length - 2), column: at.column } }) },
];

const COLUMN: readonly Tool[] = [
  { label: "Add a column to the left", edit: (table, at) => ({ table: withColumn(table, at.column), focus: at }) },
  { label: "Add a column to the right", edit: (table, at) => ({ table: withColumn(table, at.column + 1), focus: { row: at.row, column: at.column + 1 } }) },
  { label: "Move the column left", edit: (table, at) => ({ table: withColumnMoved(table, at.column, -1), focus: { row: at.row, column: Math.max(0, at.column - 1) } }) },
  { label: "Move the column right", edit: (table, at) => ({ table: withColumnMoved(table, at.column, 1), focus: { row: at.row, column: Math.min(table.header.length - 1, at.column + 1) } }) },
  { label: "Delete the column", edit: (table, at) => ({ table: withoutColumn(table, at.column), focus: { row: at.row, column: Math.max(0, at.column - 1) } }) },
];

const headerToggle: TableEdit = (table, at) => {
  const toggled = withHeaderToggled(table);

  return { table: toggled, focus: { row: hasHeader(toggled) ? -1 : 0, column: at.column } };
};

/** The icons, drawn on a 16px grid in the window's one stroke weight (`ui/icons.tsx`). */
const ICONS = {
  left: "M3 4h10M3 8h6M3 12h8",
  center: "M3 4h10M5 8h6M4 12h8",
  right: "M3 4h10M7 8h6M5 12h8",
  header: "M2.5 3.5h11v9h-11zM2.5 6.5h11M6.5 6.5v6M10 6.5v6",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5",
  chevron: "M4 6l4 4 4-4",
} as const;

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");

  for (const [name, value] of Object.entries({ viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) {
    svg.setAttribute(name, value);
  }

  stroke.setAttribute("d", path);
  svg.append(stroke);

  return svg;
}

/** A toolbar button that keeps focus in the cell, so the edit is about the cell in use. */
function button(label: string, content: (string | SVGSVGElement)[], onClick: () => void): HTMLButtonElement {
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

/** "Row" or "Column": a button opening a short menu of what can be done to it. */
function menu(name: string, tools: readonly Tool[], apply: (edit: TableEdit) => void, bar: HTMLElement): HTMLElement {
  const holder = document.createElement("span");
  const list = document.createElement("div");
  const close = () => {
    list.hidden = true;
    opener.setAttribute("aria-expanded", "false");
  };
  const opener = button(name, [name, icon(ICONS.chevron)], () => {
    const opening = list.hidden;

    // One menu open at a time.
    for (const other of bar.querySelectorAll<HTMLElement>(".md-table-menu")) {
      other.hidden = true;
    }
    list.hidden = !opening;
    opener.setAttribute("aria-expanded", String(opening));
  });

  holder.className = "md-table-menu-holder";
  opener.className = "md-table-menu-opener";
  opener.setAttribute("aria-haspopup", "menu");
  opener.setAttribute("aria-expanded", "false");
  list.className = "md-table-menu";
  list.setAttribute("role", "menu");
  list.setAttribute("aria-label", name);
  list.hidden = true;

  for (const tool of tools) {
    const item = button(tool.label, [tool.label], () => {
      close();
      apply(tool.edit);
    });

    item.setAttribute("role", "menuitem");
    list.append(item);
  }

  holder.append(opener, list);

  return holder;
}

/**
 * The toolbar's element, one row (2026-11-08: the first version wrapped onto three and
 * covered the words above the table). `apply` performs an edit on the table it sits on.
 */
export function tableTools(apply: (edit: TableEdit) => void, header: boolean): HTMLElement {
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
    menu("Row", ROW, apply, bar),
    menu("Column", COLUMN, apply, bar),
    divider(),
    button("Align the column left", [icon(ICONS.left)], () => {
      apply(align("left"));
    }),
    button("Centre the column", [icon(ICONS.center)], () => {
      apply(align("center"));
    }),
    button("Align the column right", [icon(ICONS.right)], () => {
      apply(align("right"));
    }),
    divider(),
    headerButton,
    button("Delete the table", [icon(ICONS.trash)], () => {
      apply(() => ({ table: null, focus: null }));
    }),
  );

  return bar;
}
