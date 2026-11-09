/**
 * A table's columns made wider or narrower by dragging the edge between them (2026-11-09),
 * as Notion's are. The width follows the pointer as drawing only; letting go writes it into
 * the notes once (`withWidth`), so one drag is one ⌘Z. A double-click on the edge puts the
 * column back to fitting its words.
 *
 * Rows are not dragged: a row is as tall as its words, wrapped to its columns' widths, and
 * GFM has no row height to keep.
 */
import type { EditorView } from "@codemirror/view";

import { withWidth } from "../tableModel";
import { COLUMN_WIDTH, type Table } from "./table";
import { editTable } from "./tableEdits";

const held = (width: number) => Math.min(COLUMN_WIDTH.max, Math.max(COLUMN_WIDTH.min, width));

/** Draws column `at` `width` pixels wide, or fitting its words with `null`. */
function drawWidth(element: HTMLTableElement, at: number, width: number | null): void {
  const col = element.querySelectorAll("col")[at];

  if (col !== undefined) {
    col.style.width = width === null ? "" : `${String(width)}px`;
  }

  // A chosen width may be narrower than a long word, which then wraps inside it.
  for (const row of element.rows) {
    row.cells[at]?.toggleAttribute("data-sized", width !== null);
  }
}

/** Draws every column of `element` as wide as `table` says. */
export function drawWidths(element: HTMLTableElement, table: Table): void {
  table.widths.forEach((width, at) => {
    drawWidth(element, at, width);
  });
}

/** Lights the edges of column `at` all the way down, or none with `null`. */
function light(wrap: HTMLElement, at: number | null): void {
  for (const edge of wrap.querySelectorAll<HTMLElement>(".md-col-edge")) {
    edge.classList.toggle("lit", edge.dataset.col === String(at));
  }
}

/** The edge on the right of a cell in column `at`, to drag that column's width by. */
export function columnEdge(view: EditorView, wrap: HTMLElement, at: number): HTMLElement {
  const edge = document.createElement("div");
  const write = (width: number | null) => {
    editTable(view, wrap, (table) => ({ table: withWidth(table, at, width), focus: null }));
  };

  edge.className = "md-col-edge";
  edge.dataset.col = String(at);
  // Out of the cell's name, which is its words; the tooltip still shows to the pointer.
  edge.setAttribute("aria-hidden", "true");
  edge.title = "Drag to resize the column; double-click to fit its words";
  edge.addEventListener("pointerenter", () => {
    light(wrap, at);
  });
  edge.addEventListener("pointerleave", () => {
    if (!wrap.classList.contains("resizing")) {
      light(wrap, null);
    }
  });
  edge.addEventListener("dblclick", () => {
    write(null);
  });
  edge.addEventListener("pointerdown", (event) => {
    const element = wrap.querySelector("table");
    const cell = edge.parentElement;

    if (event.button !== 0 || element === null || cell === null) {
      return;
    }

    // Not a click into the cell: neither its box nor the editor takes focus or selects.
    event.preventDefault();
    edge.setPointerCapture(event.pointerId);
    wrap.classList.add("resizing");

    const before = element.querySelectorAll("col")[at]?.style.width ?? "";
    const startX = event.clientX;
    const start = cell.getBoundingClientRect().width;
    let width = start;
    const move = (moved: PointerEvent) => {
      width = held(start + moved.clientX - startX);
      drawWidth(element, at, Math.round(width));
    };
    const end = (finished: PointerEvent) => {
      edge.removeEventListener("pointermove", move);
      edge.removeEventListener("pointerup", end);
      edge.removeEventListener("pointercancel", end);
      wrap.classList.remove("resizing");
      light(wrap, null);

      if (finished.type === "pointercancel") {
        // Taken away mid-drag (by the system, not by letting go): drawn as it was before.
        drawWidth(element, at, before === "" ? null : Number.parseFloat(before));
      } else if (Math.round(width) !== Math.round(start)) {
        write(width);
      }
    };

    edge.addEventListener("pointermove", move);
    edge.addEventListener("pointerup", end);
    edge.addEventListener("pointercancel", end);
  });

  return edge;
}
