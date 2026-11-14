/**
 * Where the cursor may stand in the notes, and what Backspace and ``` do, now that the
 * notes hide their Markdown as Notion does (2026-11-07).
 *
 * With the marks hidden, some positions would type into text nobody can see: in front of a
 * heading's hidden `# `, on a citation (an element, kept or deleted whole), or on a code
 * block's fence lines (drawn as its header and foot). So the cursor is kept off them, and
 * the keys that would reach into them act on the element instead: Backspace after a
 * citation removes the citation, in an empty code block removes the block. Typing ``` at the start of a line opens a closed code block.
 */
import { syntaxTree } from "@codemirror/language";
import { EditorState, Prec, type Extension, type Line } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { calloutOf } from "./callout";
import { blockOf, hiddenPrefix } from "./format";
import { isCitationLine } from "./preview/find";

/** A fenced code block, by its lines: the opening fence, and the closing one if it has one. */
interface Fence {
  readonly open: number;
  readonly close: number | null;
}

const CLOSING = /^\s*(`{3,}|~{3,})\s*$/;

/** The code block whose opening or closing fence is `line`, if it is either. */
function fenceAt(state: EditorState, line: Line): Fence | null {
  let found: Fence | null = null;

  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (node.name !== "FencedCode") {
        return true;
      }

      const first = state.doc.lineAt(node.from).number;
      const last = state.doc.lineAt(node.to);
      const close = last.number > first && CLOSING.test(last.text) ? last.number : null;

      if (first === line.number || close === line.number) {
        found = { open: first, close };
      }

      return false;
    },
  });

  return found;
}

/**
 * Where a cursor that came to rest at `head` should stand instead, moving the way it was
 * going (`down`) from where it was (`from`, when the text did not change): past a hidden
 * prefix, and off a citation or a fence line.
 */
export function settled(state: EditorState, head: number, down: boolean, from: number | null = null): number {
  const doc = state.doc;
  const line = doc.lineAt(head);
  const below = line.number < doc.lines ? doc.line(line.number + 1) : null;
  const above = line.number > 1 ? doc.line(line.number - 1) : null;

  // A citation, or a callout's marker line, drawn as its head: both stepped over.
  if (isCitationLine(line.text) || calloutOf(line.text) !== null) {
    return (down ? below?.from : above?.to) ?? below?.from ?? above?.to ?? head;
  }

  const fence = fenceAt(state, line);

  if (fence !== null) {
    if (line.number === fence.open) {
      // Into the block going down, which always has a first line; above it going up.
      return down || above === null ? (below?.from ?? head) : above.to;
    }

    // The closing fence: below the block going down, at the end of its last line going up.
    const lastCode = doc.line(line.number - 1);

    return down && below !== null ? below.from : lastCode.to;
  }

  // Anywhere in a hidden prefix — Home puts a to-do's cursor between its hidden `- ` and its
  // box — goes to the start of the words; from there, going back goes up a line, or ←
  // could never leave a heading.
  const words = line.from + hiddenPrefix(line.text);

  if (head >= words) {
    return head;
  }

  return !down && from === words && above !== null ? above.to : words;
}

/** Keeps a resting cursor where it can be seen to type (`settled`). */
const keepCursorVisible = EditorState.transactionFilter.of((transaction) => {
  if (transaction.selection === undefined) {
    return transaction;
  }

  const range = transaction.state.selection.main;

  if (!range.empty || transaction.state.selection.ranges.length > 1) {
    return transaction;
  }

  const was = transaction.startState.selection.main.head;
  const target = settled(transaction.state, range.head, range.head >= was, transaction.docChanged ? null : was);

  return target === range.head ? transaction : [transaction, { selection: { anchor: target }, sequential: true }];
});

/**
 * Backspace at the edge of an element acts on the element. At the start of a heading's or
 * a to-do's words it mostly needs nothing here: CodeMirror's own deletes a hidden range
 * whole, which makes the line text.
 *
 * Except a heading with a blank line above it (2026-11-14, at the user's request): the
 * blank line goes and the heading moves up, still a heading. Making it text first left the
 * heading lost by the time it moved. With words above, the first press still makes it text.
 */
function backspace(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;

  if (!range.empty) {
    return false;
  }

  const line = state.doc.lineAt(range.head);

  // At the start of a callout's first words (after the hidden `> `): the callout becomes a
  // plain quote, rather than its marker being left with nothing in it.
  if (line.number > 1 && range.head === line.from + hiddenPrefix(line.text) && calloutOf(state.doc.line(line.number - 1).text) !== null) {
    const marker = state.doc.line(line.number - 1);

    view.dispatch({ changes: { from: marker.from, to: line.from } });
    return true;
  }

  const start = line.from + hiddenPrefix(line.text);

  if (line.number > 1 && range.head === start && /^h[1-3]$/.test(blockOf(line.text)) && state.doc.line(line.number - 1).text.trim() === "") {
    const blank = state.doc.line(line.number - 1);

    view.dispatch({ changes: { from: blank.from, to: line.from }, selection: { anchor: start - line.from + blank.from } });
    return true;
  }

  if (range.head !== line.from || line.number === 1) {
    return false;
  }

  const above = state.doc.line(line.number - 1);

  // Just after a citation: the citation goes, whole.
  if (isCitationLine(above.text)) {
    view.dispatch({ changes: { from: above.from, to: line.from } });
    return true;
  }

  const fence = fenceAt(state, above);

  if (fence === null) {
    return false;
  }

  if (above.number === fence.open) {
    // At the start of a code block's first line. An empty block goes; otherwise nothing,
    // since joining the line to the fence would break the block.
    if (fence.close === fence.open + 2 && line.text === "") {
      const close = state.doc.line(fence.close);
      const to = close.number < state.doc.lines ? close.to + 1 : close.to;

      view.dispatch({ changes: { from: state.doc.line(fence.open).from, to } });
    }

    return true;
  }

  // Just after a code block: into its last line, rather than into its closing fence.
  view.dispatch({ selection: { anchor: state.doc.line(above.number - 1).to } });
  return true;
}

/**
 * Typing the third backtick at the start of an empty line opens a closed code block with the
 * cursor inside, as Notion does; left alone, an unclosed fence turns the rest of the notes
 * into code. A line is added after it at the end of the notes, so there is a way out.
 */
const openCodeBlock = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== "`" || from !== to) {
    return false;
  }

  const line = view.state.doc.lineAt(from);
  const before = view.state.doc.sliceString(line.from, from);

  if (!/^\s*``$/.test(before) || from !== line.to) {
    return false;
  }

  const last = line.number === view.state.doc.lines;

  view.dispatch({
    changes: { from, insert: `\`\n\n${before.trim()}\`${last ? "\n" : ""}` },
    selection: { anchor: from + 2 },
  });

  return true;
});

export const blockKeys: Extension = [
  keepCursorVisible,
  openCodeBlock,
  // Ahead of Markdown's and CodeMirror's own Backspace, which would join the line to a
  // citation's or a fence's hidden text, or take a callout's line out of its quote: highest,
  // since Markdown's keys are themselves above the defaults. Anything else is passed on.
  Prec.highest(keymap.of([{ key: "Backspace", run: backspace }])),
];
