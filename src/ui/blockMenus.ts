/**
 * What the block handle's menus offer (2026-11-07): `+` asks what a new line is, and ⋮⋮
 * deletes, duplicates or turns a block into another, as Notion's block menu does. Apart
 * from `BlockHandles`, which draws the handle and follows the pointer.
 */
import type { EditorView } from "@codemirror/view";

import type { Block } from "../notes/blocks";
import { chartOpener } from "../notes/chartEditing";
import { turnsInto, type Block as Kind } from "../notes/format";
import { formatBlock } from "../notes/markSelection";
import type { MenuItem } from "./PopMenu";

/**
 * What `+`'s menu turns the new line into, as Notion's does: a block type from the format
 * rules, or a code block, a diagram or a divider written out, or a chart made in the chart
 * form (2026-11-08: diagrams and charts had worked only for whoever knew the fence to type).
 */
export function turnInto(editor: EditorView): MenuItem[] {
  const as = (kind: Kind) => () => {
    formatBlock(editor, kind);
    editor.focus();
  };
  const write = (text: string, cursorAt: number) => () => {
    const line = editor.state.doc.lineAt(editor.state.selection.main.head);
    // At the very end of the notes a line follows, so there is a way out of a code block.
    const tail = line.number === editor.state.doc.lines && !text.endsWith("\n") ? "\n" : "";

    editor.dispatch({
      changes: { from: line.from, to: line.to, insert: text + tail },
      selection: { anchor: line.from + cursorAt },
    });
    editor.focus();
  };

  return [
    { label: "Text", onSelect: () => { editor.focus(); } },
    { label: "Heading 1", onSelect: as("h1") },
    { label: "Heading 2", onSelect: as("h2") },
    { label: "Heading 3", onSelect: as("h3") },
    { label: "Bulleted list", onSelect: as("bullet") },
    { label: "Numbered list", onSelect: as("numbered") },
    { label: "To-do list", onSelect: as("task") },
    { label: "Quote", onSelect: as("quote") },
    { label: "Code", onSelect: write("```\n\n```", 4) },
    { label: "Diagram", onSelect: write("```mermaid\n\n```", 11) },
    {
      label: "Chart",
      onSelect: () => {
        const line = editor.state.doc.lineAt(editor.state.selection.main.head);

        editor.state.facet(chartOpener)?.({ from: line.from, to: line.to, source: null, original: line.text });
      },
    },
    { label: "Divider", onSelect: write("---\n", 4) },
  ];
}


/** The block's own lines, with the line break that joins them to the rest. */
function span(editor: EditorView, block: Block): { readonly from: number; readonly to: number } {
  const doc = editor.state.doc;
  const first = doc.line(block.from);
  const last = doc.line(block.to);

  // Its following break, or for the last block its preceding one, so no blank line is left.
  return last.number < doc.lines ? { from: first.from, to: last.to + 1 } : { from: Math.max(0, first.from - 1), to: last.to };
}

/** How "Turn into" names each kind. */
const TURN_INTO: Readonly<Record<Kind, string>> = {
  paragraph: "Turn into text",
  h1: "Turn into heading 1",
  h2: "Turn into heading 2",
  h3: "Turn into heading 3",
  bullet: "Turn into bulleted list",
  numbered: "Turn into numbered list",
  task: "Turn into to-do",
  quote: "Turn into quote",
};

/**
 * ⋮⋮'s menu for `block`: Delete and Duplicate, and for a one-line block the kinds it can be
 * turned into (`turnsInto`): none for a citation, an image or a divider, and not the kind it
 * already is. A code block or a table is turned into nothing: it is several lines that only
 * mean something together.
 */
export function blockActions(editor: EditorView, block: Block): MenuItem[] {
  const doc = editor.state.doc;
  const actions: MenuItem[] = [
    {
      label: "Delete",
      onSelect: () => {
        const { from, to } = span(editor, block);

        editor.dispatch({ changes: { from, to }, selection: { anchor: Math.min(from, editor.state.doc.length - (to - from)) } });
        editor.focus();
      },
    },
    {
      label: "Duplicate",
      onSelect: () => {
        const text = doc.sliceString(doc.line(block.from).from, doc.line(block.to).to);
        const end = doc.line(block.to).to;

        editor.dispatch({ changes: { from: end, insert: `\n${text}` }, selection: { anchor: end + 1 } });
        editor.focus();
      },
    },
  ];

  if (block.from !== block.to) {
    return actions;
  }

  const line = doc.line(block.from);
  const as = (kind: Kind) => () => {
    editor.dispatch({ selection: { anchor: line.from, head: line.to } });
    formatBlock(editor, kind);
    editor.focus();
  };

  return [...actions, ...turnsInto(line.text).map((kind) => ({ label: TURN_INTO[kind], onSelect: as(kind) }))];
}
