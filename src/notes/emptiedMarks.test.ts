/**
 * Deleting all of a formatted text takes its marks with it; deleting part of it does not.
 */
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { dropEmptiedMarks } from "./emptiedMarks";
import { parsedWhole } from "./language";

/** `doc` after deleting `from`–`to` as Backspace on a selection does. */
function deleting(doc: string, words: string, part = words): string {
  const state = parsedWhole(EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage }), dropEmptiedMarks] }));

  const from = doc.indexOf(words) + words.indexOf(part);

  return state.update({ changes: { from, to: from + part.length }, userEvent: "delete.backward" }).state.doc.toString();
}

describe("deleting formatted words", () => {
  it("takes a highlight's marks with all of its words", () => {
    expect(deleting("Raft ==majority=={exam} wins", "majority")).toBe("Raft  wins");
    expect(deleting("Raft ==majority== wins", "majority")).toBe("Raft  wins");
  });

  it("takes bold, italic, strikethrough, code and a link's marks the same way", () => {
    expect(deleting("A **bold** b", "bold")).toBe("A  b");
    expect(deleting("A _it_ b", "it")).toBe("A  b");
    expect(deleting("A ~~gone~~ b", "gone")).toBe("A  b");
    expect(deleting("A `code` b", "code")).toBe("A  b");
    expect(deleting("A [paper](https://raft.github.io) b", "paper")).toBe("A  b");
  });

  it("takes nested marks emptied together", () => {
    expect(deleting("A ==**both**== b", "both")).toBe("A  b");
  });

  it("keeps the marks when only part of the words goes", () => {
    expect(deleting("Raft ==majority=={exam} wins", "majority", "major")).toBe("Raft ==ity=={exam} wins");
  });

  it("leaves typing over the words alone, which keeps the formatting", () => {
    const doc = "A **bold** b";
    const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage }), dropEmptiedMarks] });
    const from = doc.indexOf("bold");

    expect(state.update({ changes: { from, to: from + 4, insert: "new" }, userEvent: "input.type" }).state.doc.toString()).toBe(
      "A **new** b",
    );
  });
});
