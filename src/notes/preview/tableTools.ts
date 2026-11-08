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
  readonly text: string;
  readonly edit: TableEdit;
}

const align = (alignment: Alignment): TableEdit => (table, at) => ({ table: withAlignment(table, at.column, alignment), focus: at });

/** A body row to act on: the header row has none, so its first body row stands in. */
const bodyRow = (at: Cell) => Math.max(0, at.row);

const TOOLS: readonly (readonly Tool[])[] = [
  [
    { label: "Add a row above", text: "+ Row above", edit: (table, at) => ({ table: withRow(table, bodyRow(at)), focus: { row: bodyRow(at), column: at.column } }) },
    { label: "Add a row below", text: "+ Row below", edit: (table, at) => ({ table: withRow(table, at.row + 1), focus: { row: at.row + 1, column: at.column } }) },
    { label: "Move the row up", text: "↑", edit: (table, at) => ({ table: withRowMoved(table, at.row, -1), focus: { row: Math.max(0, at.row - 1), column: at.column } }) },
    { label: "Move the row down", text: "↓", edit: (table, at) => ({ table: withRowMoved(table, at.row, 1), focus: { row: Math.min(table.rows.length - 1, at.row + 1), column: at.column } }) },
    { label: "Delete the row", text: "Delete row", edit: (table, at) => ({ table: at.row < 0 ? table : withoutRow(table, at.row), focus: { row: Math.min(at.row, table.rows.length - 2), column: at.column } }) },
  ],
  [
    { label: "Add a column to the left", text: "+ Column left", edit: (table, at) => ({ table: withColumn(table, at.column), focus: at }) },
    { label: "Add a column to the right", text: "+ Column right", edit: (table, at) => ({ table: withColumn(table, at.column + 1), focus: { row: at.row, column: at.column + 1 } }) },
    { label: "Move the column left", text: "←", edit: (table, at) => ({ table: withColumnMoved(table, at.column, -1), focus: { row: at.row, column: Math.max(0, at.column - 1) } }) },
    { label: "Move the column right", text: "→", edit: (table, at) => ({ table: withColumnMoved(table, at.column, 1), focus: { row: at.row, column: Math.min(table.header.length - 1, at.column + 1) } }) },
    { label: "Delete the column", text: "Delete column", edit: (table, at) => ({ table: withoutColumn(table, at.column), focus: { row: at.row, column: Math.max(0, at.column - 1) } }) },
  ],
  [
    { label: "Align the column left", text: "Left", edit: align("left") },
    { label: "Centre the column", text: "Centre", edit: align("center") },
    { label: "Align the column right", text: "Right", edit: align("right") },
  ],
  [
    {
      label: "Header row",
      text: "Header",
      edit: (table, at) => {
        const toggled = withHeaderToggled(table);

        return { table: toggled, focus: { row: hasHeader(toggled) ? -1 : 0, column: at.column } };
      },
    },
    { label: "Delete the table", text: "Delete table", edit: () => ({ table: null, focus: null }) },
  ],
];

/** The toolbar's element. `apply` performs an edit on the table it sits on. */
export function tableTools(apply: (edit: TableEdit) => void, header: boolean): HTMLElement {
  const bar = document.createElement("div");

  bar.className = "md-table-tools";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Table");

  for (const group of TOOLS) {
    const set = document.createElement("span");

    set.className = "md-table-tool-group";

    for (const tool of group) {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = tool.text;
      button.title = tool.label;
      button.setAttribute("aria-label", tool.label);

      if (tool.label === "Header row") {
        button.setAttribute("aria-pressed", String(header));
      }

      // Not taking focus, so the cell being edited stays the one the edit is about.
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        apply(tool.edit);
      });
      set.append(button);
    }

    bar.append(set);
  }

  return bar;
}
