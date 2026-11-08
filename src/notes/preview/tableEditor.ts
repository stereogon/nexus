/**
 * A table in the notes, edited where it is drawn (2026-11-08).
 *
 * Each cell shows its words formatted and turns into a text box when clicked. What is typed
 * is written back into the notes as GFM (`tableModel.ts`) by an ordinary editor change — the
 * smallest one between the old text and the new — so ⌘Z undoes it with everything else and
 * nothing is kept anywhere but the notes. The table is read afresh from the notes for every
 * edit, never from the widget, so the two cannot drift apart.
 *
 * Redrawn in place when only words changed (`updateDOM`), so the cell being typed in keeps
 * its focus and caret; rebuilt when rows or columns changed, and the cell to be in is then
 * focused again.
 */
import { redo, undo } from "@codemirror/commands";
import { WidgetType, type EditorView } from "@codemirror/view";

import { hasHeader, withCell, withRow, type Cell } from "../tableModel";
import { appendInline, type Table } from "./table";
import { editTable, leave } from "./tableEdits";
import { closeAll, showAlignment, tableTools } from "./tableTools";

const cellOf = (input: HTMLInputElement): Cell => ({ row: Number(input.dataset.row), column: Number(input.dataset.col) });

/** What the keys do in a cell: move between cells, add a row at the end, undo, leave. */
function onKey(event: KeyboardEvent, view: EditorView, wrap: HTMLElement, input: HTMLInputElement, rows: () => number): void {
  const at = cellOf(input);
  const inputs = [...wrap.querySelectorAll<HTMLInputElement>("input.md-cell-input")];
  const index = inputs.indexOf(input);
  const cellAt = (row: number, column: number) =>
    wrap.querySelector<HTMLInputElement>(`input[data-row="${String(row)}"][data-col="${String(column)}"]`);
  const addRowAndGo = (column: number) => {
    editTable(view, wrap, (table) => ({ table: withRow(table, table.rows.length), focus: { row: table.rows.length, column } }));
  };

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    // The editor's history, which holds every cell edit; the box's own would not.
    event.preventDefault();
    (event.shiftKey ? redo : undo)(view);
    return;
  }

  switch (event.key) {
    case "Tab": {
      event.preventDefault();
      const next = inputs[index + (event.shiftKey ? -1 : 1)];

      if (next !== undefined) {
        next.focus();
        next.select();
      } else if (!event.shiftKey) {
        addRowAndGo(0);
      }
      return;
    }
    case "Enter": {
      event.preventDefault();
      const below = cellAt(at.row + 1, at.column);

      if (below !== null) {
        below.focus();
      } else if (at.row + 1 >= rows()) {
        addRowAndGo(at.column);
      }
      return;
    }
    case "ArrowUp":
    case "ArrowDown": {
      const other = cellAt(at.row + (event.key === "ArrowUp" ? -1 : 1), at.column);

      if (other !== null) {
        event.preventDefault();
        other.focus();
      }
      return;
    }
    case "Escape":
      event.preventDefault();
      leave(view, wrap);
      return;
    default:
      return;
  }
}

/** The table's rows and columns, and whether it has a header, as one comparable string. */
const shapeOf = (table: Table) => `${String(hasHeader(table))}:${String(table.header.length)}:${String(table.rows.length)}`;

/** Draws `table` into `wrap`: the toolbar, then the cells. */
function build(wrap: HTMLElement, view: EditorView, table: Table): void {
  const scroller = document.createElement("div");
  const element = document.createElement("table");
  const current = (): Cell => ({ row: Number(wrap.dataset.row ?? "0"), column: Number(wrap.dataset.col ?? "0") });

  scroller.className = "md-table";
  wrap.dataset.shape = shapeOf(table);
  wrap.replaceChildren(
    tableTools((edit) => {
      editTable(view, wrap, (fresh) => edit(fresh, current()));
    }, hasHeader(table), table.align[current().column] ?? null),
    scroller,
  );

  const cell = (row: number, column: number, text: string): HTMLTableCellElement => {
    const box = document.createElement(row < 0 ? "th" : "td");
    const shown = document.createElement("span");
    const input = document.createElement("input");
    const align = table.align[column];

    if (align !== null && align !== undefined) {
      box.style.textAlign = align;
    }

    shown.className = "md-cell-view";
    appendInline(shown, text);
    input.className = "md-cell-input";
    input.value = text;
    input.dataset.row = String(row);
    input.dataset.col = String(column);
    input.setAttribute("aria-label", row < 0 ? `Header, column ${String(column + 1)}` : `Row ${String(row + 1)}, column ${String(column + 1)}`);
    input.addEventListener("focus", () => {
      wrap.dataset.row = String(row);
      wrap.dataset.col = String(column);
      // From the cell as drawn now, which an alignment edit redraws in place.
      const drawn = box.style.textAlign;

      showAlignment(wrap.querySelector(".md-table-tools"), drawn === "center" || drawn === "right" || drawn === "left" ? drawn : null);
    });
    input.addEventListener("input", () => {
      const caret = input.selectionStart;

      editTable(view, wrap, (fresh) => ({ table: withCell(fresh, cellOf(input), input.value), focus: cellOf(input) }), caret);
    });
    input.addEventListener("keydown", (event) => {
      onKey(event, view, wrap, input, () => wrap.querySelectorAll("tbody tr").length);
    });
    box.append(shown, input);

    return box;
  };

  if (hasHeader(table)) {
    const head = element.createTHead().insertRow();

    table.header.forEach((text, column) => {
      head.append(cell(-1, column, text));
    });
  }

  const body = element.createTBody();

  table.rows.forEach((cells, row) => {
    const line = body.insertRow();

    cells.forEach((text, column) => {
      line.append(cell(row, column, text));
    });
  });
  scroller.append(element);
}

export class TableEditorWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly table: Table,
  ) {
    super();
  }

  override eq(other: TableEditorWidget): boolean {
    return other.source === this.source;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");

    wrap.className = "md-table-editable";
    // Once per element, not per `build`, which runs again when the shape changes.
    // Leaving the table closes any option strip left open on its toolbar.
    wrap.addEventListener("focusout", (event) => {
      if (!(event.relatedTarget instanceof Node && wrap.contains(event.relatedTarget))) {
        const bar = wrap.querySelector(".md-table-tools");

        if (bar !== null) {
          closeAll(bar);
        }
      }
    });
    build(wrap, view, this.table);

    return wrap;
  }

  /**
   * Redraws in place: only the words when the rows and columns are the same, leaving alone
   * the box being typed in when it already says this, so its caret stays where it is.
   */
  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    if (!dom.classList.contains("md-table-editable")) {
      return false;
    }

    if (dom.dataset.shape !== shapeOf(this.table)) {
      build(dom, view, this.table);
      return true;
    }

    for (const input of dom.querySelectorAll<HTMLInputElement>("input.md-cell-input")) {
      const { row, column } = cellOf(input);
      const text = (row < 0 ? this.table.header : this.table.rows[row])?.[column] ?? "";
      const box = input.parentElement;
      const align = this.table.align[column];

      if (input.value.trim() !== text.trim() || (input !== document.activeElement && input.value !== text)) {
        input.value = text;
      }

      if (box !== null) {
        box.style.textAlign = align ?? "";

        if (input === document.activeElement) {
          showAlignment(dom.querySelector(".md-table-tools"), align ?? null);
        }
        box.querySelector(".md-cell-view")?.replaceChildren();
        const shown = box.querySelector<HTMLElement>(".md-cell-view");

        if (shown !== null) {
          appendInline(shown, text);
        }
      }
    }

    return true;
  }

  /** The table handles its own clicks and keys; the editor's would move its cursor. */
  override ignoreEvent(): boolean {
    return true;
  }
}
