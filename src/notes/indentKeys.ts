/**
 * Tab and Shift-Tab in the notes (2026-11-09): a list item nested under the one above it,
 * or brought back out a level, with any other list lines selected along with it; inside a
 * code block, the code indented. Notion nests with Tab; until now Tab here left the editor.
 *
 * Only list lines nest. In Markdown an indented paragraph is a code block, so Tab anywhere
 * else keeps its ordinary job of moving focus on, which also keeps the editor from trapping
 * someone using the keyboard.
 */
import { indentLess, indentMore } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";

/** A list line: its indentation, and the width of its marker with the space after it. */
const LIST = /^(\s*)([-*+]\s+|\d+[.)]\s+)/;

interface ListLine {
  readonly indent: number;
  /** How far in this item's own content starts, which is where a child's marker goes. */
  readonly content: number;
}

export function listLine(text: string): ListLine | null {
  const match = LIST.exec(text);
  const indent = match?.[1]?.length ?? 0;

  return match === null ? null : { indent, content: indent + (match[2]?.length ?? 0) };
}

/** The nearest list line above `number` whose indentation is `fits`, stopping at prose. */
function above(state: EditorState, number: number, fits: (item: ListLine) => boolean): ListLine | null {
  for (let at = number - 1; at >= 1; at -= 1) {
    const text = state.doc.line(at).text;
    const item = listLine(text);

    if (item === null) {
      if (text.trim() !== "") {
        return null;
      }
      continue;
    }

    if (fits(item)) {
      return item;
    }
  }

  return null;
}

/**
 * How far the selected list lines move: in by one level under the item above, or out to
 * the level of the item they are nested in. `null` when the first line cannot go there,
 * or the selection holds anything but list lines.
 */
export function indentShift(state: EditorState, inward: boolean): { readonly first: number; readonly last: number; readonly by: number } | null {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;

  for (let number = first; number <= last; number += 1) {
    if (listLine(state.doc.line(number).text) === null) {
      return null;
    }
  }

  const lead = listLine(state.doc.line(first).text);

  if (lead === null) {
    return null;
  }

  if (inward) {
    // A child of the item above at the same level; not deeper than one level under it.
    const parent = above(state, first, (item) => item.indent <= lead.indent);

    return parent === null || parent.indent !== lead.indent ? null : { first, last, by: parent.content - lead.indent };
  }

  const parent = lead.indent === 0 ? null : above(state, first, (item) => item.indent < lead.indent);

  return parent === null ? null : { first, last, by: parent.indent - lead.indent };
}

function shift(view: EditorView, inward: boolean): boolean {
  const moved = indentShift(view.state, inward);

  if (moved === null) {
    return false;
  }

  const changes = [];

  for (let number = moved.first; number <= moved.last; number += 1) {
    const line = view.state.doc.line(number);
    const indent = listLine(line.text)?.indent ?? 0;

    changes.push(
      moved.by > 0
        ? { from: line.from, insert: " ".repeat(moved.by) }
        : { from: line.from, to: line.from + Math.min(indent, -moved.by) },
    );
  }

  view.dispatch({ changes, userEvent: inward ? "indent" : "dedent" });

  return true;
}

function inCode(state: EditorState): boolean {
  for (let node = syntaxTree(state).resolveInner(state.selection.main.head, -1); ; ) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") {
      return true;
    }

    const parent = node.parent;

    if (parent === null) {
      return false;
    }

    node = parent;
  }
}

/** On a list line nest or un-nest; in code indent; otherwise let Tab move focus on. */
function tab(inward: boolean) {
  return (view: EditorView): boolean => {
    if (inCode(view.state)) {
      return inward ? indentMore(view) : indentLess(view);
    }

    // On a list line Tab is always the editor's, even when it cannot nest further, so a
    // press that does nothing does not throw focus out of the notes mid-list.
    return shift(view, inward) || listLine(view.state.doc.lineAt(view.state.selection.main.head).text) !== null;
  };
}

export const indentKeys: Extension = Prec.high(
  keymap.of([
    { key: "Tab", run: tab(true) },
    { key: "Shift-Tab", run: tab(false) },
  ]),
);
