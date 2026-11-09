/**
 * What the block handle's menus offer (2026-11-07): `+` asks what a new line is, and ⋮⋮
 * deletes, duplicates or turns a block into another, as Notion's block menu does. Apart
 * from `BlockHandles`, which draws the handle and follows the pointer.
 */
import type { EditorView } from "@codemirror/view";

import { blockAt, type Block } from "../notes/blocks";
import { chartOpener } from "../notes/chartEditing";
import { tablePicker } from "../notes/tableInsert";
import { KINDS, turnsInto, type Block as Kind } from "../notes/format";
import { formatBlock } from "../notes/markSelection";
import type { MenuItem } from "./PopMenu";

/**
 * The line the cursor is on if it is empty, or else a new empty one opened below it, for
 * a block that replaces a whole line: from "/" typed after some words, writing over the
 * line would lose them.
 */
function freshLine(editor: EditorView): { readonly from: number; readonly to: number; readonly original: string } {
  const line = editor.state.doc.lineAt(editor.state.selection.main.head);

  if (line.text.trim() === "") {
    return { from: line.from, to: line.to, original: line.text };
  }

  editor.dispatch({ changes: { from: line.to, insert: "\n" }, selection: { anchor: line.to + 1 } });

  return { from: line.to + 1, to: line.to + 1, original: "" };
}

/**
 * What `+`'s menu and the "/" menu turn the line into, as Notion's do: a block type from
 * the format rules, or a code block, a table, a diagram or a divider written out, or a
 * chart made in the chart form (2026-11-08: diagrams and charts had worked only for whoever
 * knew the fence to type).
 */
export function turnInto(editor: EditorView): MenuItem[] {
  const as = (kind: Kind) => () => {
    formatBlock(editor, kind);
    editor.focus();
  };
  const write = (text: string, cursorAt: number) => () => {
    const line = freshLine(editor);
    // At the very end of the notes a line follows, so there is a way out of a code block.
    const tail = line.to === editor.state.doc.length && !text.endsWith("\n") ? "\n" : "";

    editor.dispatch({
      changes: { from: line.from, to: line.to, insert: text + tail },
      selection: { anchor: line.from + cursorAt },
    });
    editor.focus();
  };

  return [
    { label: "Text", onSelect: as("paragraph") },
    { label: "Heading 1", onSelect: as("h1") },
    { label: "Heading 2", onSelect: as("h2") },
    { label: "Heading 3", onSelect: as("h3") },
    { label: "Bulleted list", onSelect: as("bullet") },
    { label: "Numbered list", onSelect: as("numbered") },
    { label: "To-do list", onSelect: as("task") },
    { label: "Quote", onSelect: as("quote") },
    { label: "Callout", onSelect: write("> [!NOTE]\n> ", 12) },
    { label: "Code", onSelect: write("```\n\n```", 4) },
    {
      label: "Table",
      onSelect: () => {
        editor.state.facet(tablePicker)?.(freshLine(editor));
      },
    },
    { label: "Diagram", onSelect: write("```mermaid\n\n```", 11) },
    {
      label: "Chart",
      onSelect: () => {
        editor.state.facet(chartOpener)?.({ ...freshLine(editor), source: null });
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

  const lines = Array.from({ length: block.to - block.from + 1 }, (_, at) => doc.line(block.from + at));
  const text = doc.toString();
  // Turned into another kind only when every line is a block of its own that can be: never
  // the lines of a code block or a table, which only mean something together.
  const convertible = lines.every((line) => {
    const own = blockAt(text, line.number);

    return own.from === own.to && turnsInto(line.text).length > 0;
  });

  if (!convertible) {
    return actions;
  }

  const first = lines[0];
  const last = lines[lines.length - 1];
  const as = (kind: Kind) => () => {
    editor.dispatch({ selection: { anchor: first?.from ?? 0, head: last?.to ?? 0 } });
    formatBlock(editor, kind);
    editor.focus();
  };
  // One line offers every kind but its own; several, every kind, since they may differ.
  const kinds = lines.length === 1 && first !== undefined ? turnsInto(first.text) : KINDS;

  return [...actions, ...kinds.map((kind) => ({ label: TURN_INTO[kind], onSelect: as(kind) }))];
}
