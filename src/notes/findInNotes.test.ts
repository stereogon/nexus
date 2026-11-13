/**
 * Finding in the notes: every match ignoring case, query characters taken literally, and the
 * match the selection is on counted as the current one.
 */
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { matchesOf, notesFind, setFind } from "./findInNotes";

describe("finding in the notes", () => {
  it("finds every match, ignoring case", () => {
    expect(matchesOf("Leader, leader, LEADER", "leader")).toEqual([
      { from: 0, to: 6 },
      { from: 8, to: 14 },
      { from: 16, to: 22 },
    ]);
  });

  it("takes the query's characters as written, not as a pattern", () => {
    expect(matchesOf("a.b axb (c) **d**", ".")).toEqual([{ from: 1, to: 2 }]);
    expect(matchesOf("a.b axb (c) **d**", "(c)")).toEqual([{ from: 8, to: 11 }]);
    expect(matchesOf("a.b axb (c) **d**", "**")).toHaveLength(2);
    expect(matchesOf("anything", "")).toEqual([]);
  });

  it("counts the selected match as current, and follows the text as it changes", () => {
    const start = EditorState.create({ doc: "one two one", extensions: notesFind });
    const open = start.update({ effects: setFind.of({ query: "one", open: true }), selection: { anchor: 8, head: 11 } }).state;

    expect(open.field(notesFind)).toMatchObject({ current: 1, opened: 1, matches: [{ from: 0 }, { from: 8 }] });

    const edited = open.update({ changes: { from: 0, insert: "one " } }).state;

    expect(edited.field(notesFind)?.matches).toHaveLength(3);
    expect(edited.update({ effects: setFind.of(null) }).state.field(notesFind)).toBeNull();
  });
});
