/**
 * A table cell's words, edited as they are drawn (2026-11-09): bold stays bold while typing,
 * with no `**` to step around, as everywhere else in the notes. Asked for by the user after
 * seeing the markers appear the moment a cell was clicked: it was a plain text box laid
 * over the drawn words.
 *
 * The cell is a small editable element holding the formatted words (`appendInline`), and
 * what is typed is read back out of it as GFM inline Markdown (`cellMarkdown`): bold,
 * italic, strikethrough and code, which are what a cell draws. CodeMirror leaves edits and selections
 * inside a widget alone, so the element is the browser's to edit.
 */
import { appendInline } from "./table";

const isBold = (element: HTMLElement) =>
  element.nodeName === "STRONG" || element.nodeName === "B" || Number(element.style.fontWeight) >= 600 || element.style.fontWeight === "bold";
const isItalic = (element: HTMLElement) => element.nodeName === "EM" || element.nodeName === "I" || element.style.fontStyle === "italic";
const isStruck = (element: HTMLElement) =>
  element.nodeName === "S" || element.nodeName === "DEL" || element.nodeName === "STRIKE" || element.style.textDecoration.includes("line-through");

/** `inner` between `mark`s, with its edge spaces outside them, where GFM needs them. */
function marked(inner: string, mark: string): string {
  const core = inner.trim();

  if (core === "") {
    return inner;
  }

  const lead = inner.slice(0, inner.indexOf(core));

  return `${lead}${mark}${core}${mark}${inner.slice(lead.length + core.length)}`;
}

function inline(node: Node, last: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // A cell is one line in GFM: a line break becomes a space.
    return (node.textContent ?? "").replace(/\r\n|[\r\n]/g, " ");
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  if (node.nodeName === "BR") {
    // The browser keeps an empty or line-ending editable a line high with a trailing break.
    return last ? "" : " ";
  }

  if (node.nodeName === "CODE") {
    return node.textContent === "" ? "" : `\`${node.textContent}\``;
  }

  const children = [...node.childNodes];
  const inner = children.map((child, at) => inline(child, last && at === children.length - 1)).join("");
  const bold = isBold(node) ? marked(inner, "**") : inner;

  // Italic as `_`, the notes' own italic marker (`format.ts`), so the format bar knows it.
  const italic = isItalic(node) ? marked(bold, "_") : bold;

  return isStruck(node) ? marked(italic, "~~") : italic;
}

/** The words in `cell` as the GFM inline Markdown they were drawn from. */
export function cellMarkdown(cell: HTMLElement): string {
  const children = [...cell.childNodes];

  return children.map((child, at) => inline(child, at === children.length - 1)).join("");
}

/** Draws `text` into `cell` formatted, replacing what it held. */
export function drawCell(cell: HTMLElement, text: string): void {
  cell.replaceChildren();
  appendInline(cell, text);
}

/** Puts the caret at the end of `cell`'s words, or selects them all with `all`. */
export function caretIn(cell: HTMLElement, all = false): void {
  const selection = cell.ownerDocument.getSelection();
  const range = cell.ownerDocument.createRange();

  range.selectNodeContents(cell);

  if (!all) {
    range.collapse(false);
  }

  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Puts `text` in place of what is selected in `cell`, as plain words, the caret after them. */
export function insertPlain(cell: HTMLElement, text: string): void {
  const selection = cell.ownerDocument.getSelection();
  const range = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  if (range === null || !cell.contains(range.commonAncestorContainer)) {
    return;
  }

  const words = cell.ownerDocument.createTextNode(text.replace(/\s*(\r\n|[\r\n])\s*/g, " "));

  range.deleteContents();
  range.insertNode(words);
  range.setStartAfter(words);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}
