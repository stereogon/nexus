/**
 * Tab and Shift-Tab on list lines: one level under the item above, back out to the level
 * of the item it sits in, never on prose.
 */
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { indentShift, listLine } from "./indentKeys";

/** `doc` with the cursor at the end of line `from`, or a selection over lines `from`–`to`. */
function at(doc: string, from: number, to = from): EditorState {
  const state = EditorState.create({ doc });

  return state.update({ selection: EditorSelection.range(state.doc.line(from).from, state.doc.line(to).to) }).state;
}

describe("a list line", () => {
  it("knows where its content starts, which is where a child's marker goes", () => {
    expect(listLine("- milk")).toEqual({ indent: 0, content: 2 });
    expect(listLine("  1. step")).toEqual({ indent: 2, content: 5 });
    expect(listLine("- [ ] task")).toEqual({ indent: 0, content: 2 });
    expect(listLine("words")).toBeNull();
  });
});

describe("Tab", () => {
  it("nests an item under the one above, by that item's marker", () => {
    expect(indentShift(at("- a\n- b", 2), true)).toEqual({ first: 2, last: 2, by: 2 });
    expect(indentShift(at("1. a\n1. b", 2), true)?.by).toBe(3);
  });

  it("does nothing to the first item, or one already nested a level", () => {
    expect(indentShift(at("- a\n- b", 1), true)).toBeNull();
    expect(indentShift(at("- a\n  - b", 2), true)).toBeNull();
  });

  it("moves every selected list line together, and leaves a selection with prose alone", () => {
    expect(indentShift(at("- a\n- b\n- c", 2, 3), true)).toEqual({ first: 2, last: 3, by: 2 });
    expect(indentShift(at("- a\nwords\n- c", 2, 3), true)).toBeNull();
  });
});

describe("Shift-Tab", () => {
  it("brings a nested item out to its parent's level", () => {
    expect(indentShift(at("- a\n  - b", 2), false)).toEqual({ first: 2, last: 2, by: -2 });
    expect(indentShift(at("1. a\n   1. b", 2), false)?.by).toBe(-3);
  });

  it("does nothing to an item at the top level", () => {
    expect(indentShift(at("- a\n- b", 2), false)).toBeNull();
  });
});
