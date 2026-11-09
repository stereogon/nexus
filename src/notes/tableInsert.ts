/**
 * Inserting a table from `+`'s menu (2026-11-08): the menu asks the editor to open the size
 * picker for the new line, through a facet the editor is built with, as the chart form is
 * opened (`chartEditing.ts`), and the picked size is written here.
 */
import { Facet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { focusCell } from "./preview/tableEdits";
import { blankTable, writeTable } from "./tableModel";

/** The line a new table replaces, as it read when the picker opened. */
export interface TableLine {
  readonly from: number;
  readonly to: number;
  readonly original: string;
}

/** How the editor opens the table picker; none in an editor without one. */
export const tablePicker = Facet.define<(line: TableLine) => void, ((line: TableLine) => void) | null>({
  combine: (openers) => openers[0] ?? null,
});

/**
 * Writes a blank table, `rows` high counting its header and `columns` wide, over `line`,
 * and puts the cursor in its first heading to be named. If the line changed since the
 * picker opened, writing over it would replace the wrong text, so the table goes on a new
 * line after the cursor's instead.
 *
 * A blank line is kept on each side: GFM carries a table on into a line that follows it
 * without one, so the next paragraph would become a row.
 */
export function insertTable(view: EditorView, line: TableLine, rows: number, columns: number): void {
  const doc = view.state.doc;
  const unchanged = line.to <= doc.length && view.state.sliceDoc(line.from, line.to) === line.original;
  const cursorLine = doc.lineAt(view.state.selection.main.head);
  const from = unchanged ? line.from : cursorLine.to;
  const to = unchanged ? line.to : cursorLine.to;
  const before = doc.lineAt(from);
  const after = doc.lineAt(to);
  const previous = before.number > 1 ? doc.line(before.number - 1).text : "";
  const next = after.number < doc.lines ? doc.line(after.number + 1).text : null;
  const prefix = (unchanged ? "" : "\n") + (unchanged && previous.trim() === "" ? "" : "\n");
  const suffix = next === null ? "\n\n" : next.trim() === "" ? "" : "\n";
  const text = writeTable(blankTable(Math.max(0, rows - 1), columns));

  view.dispatch({ changes: { from, to, insert: prefix + text + suffix }, userEvent: "input.table" });
  focusCell(view, from + prefix.length, { row: -1, column: 0 });
  // Its name selected, so typing replaces "Column 1".
  const box = view.contentDOM.ownerDocument.activeElement;

  if (box instanceof HTMLTextAreaElement) {
    box.select();
  }
}
