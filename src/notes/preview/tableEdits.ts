/**
 * Applying edits to a table in the notes (2026-11-08): finding the table a drawn element
 * stands for, reading it afresh, writing the edited table back by the smallest change, and
 * putting focus in the cell to be in afterwards. Split from `tableEditor.ts`, which draws
 * the table and decides which edit a click or key means.
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";

import { writeTable, type Cell } from "../tableModel";
import { parseTable, tableStart, type Table } from "./table";
import type { TableEdit } from "./tableTools";

/** The table's place in the notes, its widths line included, found from its drawn element. */
export function tableRange(view: EditorView, wrap: HTMLElement): { readonly from: number; readonly to: number } | null {
  const doc = view.state.doc;
  const at = doc.lineAt(view.posAtDOM(wrap));
  const next = at.number < doc.lines ? doc.line(at.number + 1) : null;
  // The element starts at the widths line, when there is one, and the rows on the line after.
  const rows = next !== null && tableStart(doc, next.from) === at.from ? next.from : at.from;
  let node = syntaxTree(view.state).resolveInner(rows, 1);

  while (node.name !== "Table") {
    const parent = node.parent;

    if (parent === null) {
      return null;
    }

    node = parent;
  }

  return { from: tableStart(view.state.doc, node.from), to: node.to };
}

/** Focuses `cell` of the table that starts at `from`, the caret at `caret` or its end. */
export function focusCell(view: EditorView, from: number, cell: Cell, caret: number | null = null): void {
  for (const wrap of view.contentDOM.querySelectorAll<HTMLElement>(".md-table-editable")) {
    if (view.posAtDOM(wrap) === from) {
      const input = wrap.querySelector<HTMLTextAreaElement>(`.md-cell-input[data-row="${String(cell.row)}"][data-col="${String(cell.column)}"]`);
      const at = Math.min(caret ?? Number.MAX_SAFE_INTEGER, input?.value.length ?? 0);

      input?.focus();
      input?.setSelectionRange(at, at);
      return;
    }
  }
}

/** Replaces `from`–`to`, which held `before`, with `after`, by the smallest change that does it. */
function smallestChange(from: number, before: string, after: string): { from: number; to: number; insert: string } {
  let start = 0;

  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }

  let end = 0;

  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) {
    end += 1;
  }

  return { from: from + start, to: from + before.length - end, insert: after.slice(start, after.length - end) };
}

/** Applies `change` to the table drawn in `wrap`, then focuses the cell it names. */
export function editTable(view: EditorView, wrap: HTMLElement, change: (table: Table) => ReturnType<TableEdit>, caret: number | null = null): void {
  const range = tableRange(view, wrap);
  const before = range === null ? "" : view.state.sliceDoc(range.from, range.to);
  const current = parseTable(before);

  if (range === null || current === null) {
    return;
  }

  const { table, focus } = change(current);

  if (table === null) {
    const to = range.to < view.state.doc.length ? range.to + 1 : range.to;

    view.dispatch({ changes: { from: range.from, to }, selection: { anchor: range.from }, userEvent: "delete" });
    view.focus();
    return;
  }

  view.dispatch({ changes: smallestChange(range.from, before, writeTable(table)), userEvent: "input.table" });

  if (focus !== null) {
    focusCell(view, range.from, focus, caret);
  }
}

/**
 * Moves the editor's cursor out, below the table, on a new line with a blank one between.
 * Not on the line straight after it: GFM carries a table on into any line that follows it
 * without a blank, so what was typed there became a row (found by the journey, 2026-11-08).
 */
export function leave(view: EditorView, wrap: HTMLElement): void {
  const range = tableRange(view, wrap);

  if (range === null) {
    return;
  }

  view.dispatch({ changes: { from: range.to, insert: "\n\n" }, selection: { anchor: range.to + 2 }, scrollIntoView: true });
  view.focus();
}
