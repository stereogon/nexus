/**
 * Moving blocks from the keyboard: past the block above or below, a code block moving and
 * being passed whole.
 */
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { moveChange, selectedBlocks } from "./blockShortcuts";

function at(doc: string, from: number, to = from): EditorState {
  const state = EditorState.create({ doc });

  return state.update({ selection: EditorSelection.range(state.doc.line(from).from, state.doc.line(to).from) }).state;
}

function moved(doc: string, line: number, by: -1 | 1, to = line): string | null {
  const state = at(doc, line, to);
  const change = moveChange(state, by);

  return change === null ? null : state.update({ changes: change }).state.doc.toString();
}

describe("moving blocks", () => {
  it("swaps a line with the one above or below", () => {
    expect(moved("a\nb\nc", 2, -1)).toBe("b\na\nc");
    expect(moved("a\nb\nc", 2, 1)).toBe("a\nc\nb");
  });

  it("goes nowhere past the top or the bottom", () => {
    expect(moved("a\nb", 1, -1)).toBeNull();
    expect(moved("a\nb", 2, 1)).toBeNull();
  });

  it("passes a code block whole, rather than landing inside it", () => {
    expect(moved("```\ncode\n```\nafter", 4, -1)).toBe("after\n```\ncode\n```");
  });

  it("moves every block a selection touches", () => {
    expect(selectedBlocks(at("a\nb\nc\nd", 2, 3))).toEqual({ from: 2, to: 3 });
    expect(moved("a\nb\nc\nd", 2, 1, 3)).toBe("a\nd\nb\nc");
  });
});
