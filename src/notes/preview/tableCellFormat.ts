/**
 * Bold, italic, strikethrough and code in a table cell (2026-11-09), from the floating
 * format bar, the strip under the notes' header and their keys, as everywhere else in the
 * notes. Reported when cells became formatted text: the bar went on following the editor's
 * own selection, which a cell's is not part of.
 *
 * The cell's words are read as Markdown with the selection's two ends marked in it, the
 * same rules as the rest of the notes (`toggleInline`, `hasInline`) are applied to that, and
 * the result is drawn back with the same words still selected and written into the notes.
 */
import { ChangeSet, Text as Doc } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { MenuAt } from "../../ui/menuPlacement";
import type { FormatState } from "../../ui/NotesFormatBar";
import { cursorInside, hasInline, toggleInline, type Inline } from "../format";
import { withCell } from "../tableModel";
import { cellMarkdown, drawCell } from "./tableCell";
import { editTable } from "./tableEdits";

/** Characters no one types, standing for the selection's ends while it is read and redrawn. */
const START = "";
const END = "";

/** The cell of a table in `view` that is being typed in, if one is. */
export function activeCell(view: EditorView): HTMLElement | null {
  const active = view.dom.ownerDocument.activeElement;

  return active instanceof HTMLElement && active.classList.contains("md-cell-input") && view.contentDOM.contains(active) ? active : null;
}

/** The child indexes leading from `root` down to `node`. */
function pathTo(root: Node, node: Node): number[] {
  const path: number[] = [];

  for (let at: Node | null = node; at !== null && at !== root; at = at.parentNode) {
    const parent: Node | null = at.parentNode;

    path.unshift(parent === null ? 0 : Array.prototype.indexOf.call(parent.childNodes, at));
  }

  return path;
}

function follow(root: Node, path: readonly number[]): Node | null {
  return path.reduce<Node | null>((node, index) => node?.childNodes[index] ?? null, root);
}

/** Puts `mark` at `offset` in `node`: into its text, or as a child at that index. */
function place(node: Node | null, offset: number, mark: string): void {
  if (node instanceof Text) {
    const text = node.data;

    node.textContent = text.slice(0, offset) + mark + text.slice(offset);
  } else if (node !== null) {
    node.insertBefore(new Text(mark), node.childNodes[offset] ?? null);
  }
}

/** The cell's Markdown and where its selection's ends fall in it, or `null` with none there. */
function selectionIn(cell: HTMLElement): { readonly markdown: string; readonly from: number; readonly to: number } | null {
  const selection = cell.ownerDocument.getSelection();
  const range = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  if (range === null || !cell.contains(range.startContainer) || !cell.contains(range.endContainer)) {
    return null;
  }

  // Marked in a copy, the end first, so the start's place is not moved by it.
  const copy = cell.cloneNode(true);
  const start = pathTo(cell, range.startContainer);
  const end = pathTo(cell, range.endContainer);

  place(follow(copy, end), range.endOffset, END);
  place(follow(copy, start), range.startOffset, START);

  const marked = cellMarkdown(copy as HTMLElement);
  const from = marked.indexOf(START);
  const markdown = marked.replace(START, "").replace(END, "");

  return from === -1 ? null : { markdown, from, to: marked.replace(START, "").indexOf(END) };
}

/** Draws `markdown` into `cell` with `from`–`to` selected. */
function drawSelected(cell: HTMLElement, markdown: string, from: number, to: number): void {
  drawCell(cell, markdown.slice(0, from) + START + markdown.slice(from, to) + END + markdown.slice(to));

  const found = (mark: string): { node: Text; offset: number } | null => {
    const walker = cell.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const offset = node.textContent?.indexOf(mark) ?? -1;

      if (offset !== -1 && node instanceof Text) {
        node.deleteData(offset, 1);
        return { node, offset };
      }
    }

    return null;
  };
  const start = found(START);
  const end = found(END);
  const selection = cell.ownerDocument.getSelection();

  if (start !== null && end !== null && selection !== null) {
    const range = cell.ownerDocument.createRange();

    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/** Bold, italic, strikethrough or code on the words selected in `cell`, or off them; `true` if done. */
export function formatCell(view: EditorView, cell: HTMLElement, kind: Inline): boolean {
  const selected = selectionIn(cell);
  const wrap = cell.closest<HTMLElement>(".md-table-editable");

  // A bare cursor is left alone: an empty pair of marks would be drawn as the marks.
  if (selected === null || selected.from === selected.to || wrap === null) {
    return false;
  }

  const set = ChangeSet.of(toggleInline(selected.markdown, selected.from, selected.to, kind), selected.markdown.length);
  const next = set.apply(Doc.of([selected.markdown])).toString();
  const at = { row: Number(cell.dataset.row), column: Number(cell.dataset.col) };

  drawSelected(cell, next, set.mapPos(selected.from, 1), set.mapPos(selected.to, -1));
  editTable(view, wrap, (table) => ({ table: withCell(table, at, cellMarkdown(cell)), focus: null }));

  return true;
}

/** What the format controls show for the cell being typed in, or `null` when none is. */
export function cellFormatting(
  view: EditorView,
): { readonly at: MenuAt | null; readonly state: FormatState; readonly selected: boolean; readonly inCell: true } | null {
  const cell = activeCell(view);
  const selected = cell === null ? null : selectionIn(cell);

  if (cell === null) {
    return null;
  }

  const has = (kind: Inline) =>
    selected !== null &&
    (selected.from === selected.to ? cursorInside(selected.markdown, selected.from, kind) : hasInline(selected.markdown, selected.from, selected.to, kind));
  const range = cell.ownerDocument.getSelection()?.getRangeAt(0);
  const box = selected !== null && selected.from !== selected.to ? range?.getBoundingClientRect() : undefined;

  return {
    at: box === undefined ? null : { left: box.left, top: box.bottom + 8, above: box.top - 8 },
    state: { inline: { bold: has("bold"), italic: has("italic"), strike: has("strike"), code: has("code") }, block: "paragraph", highlight: null, paint: null },
    selected: selected !== null && selected.from !== selected.to,
    inCell: true,
  };
}
