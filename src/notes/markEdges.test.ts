/**
 * Deleting inside a highlight keeps it one, moving a space that would touch its marks outside them.
 */
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { notesMarkdown } from "./language";
import { keepMarksWhole } from "./markEdges";

/** `doc` after deleting `part` with the cursor left where it was, as Backspace does, and where the cursor lands, as `|`. */
function deleting(doc: string, part: string, userEvent = "delete.backward"): string {
  const state = EditorState.create({ doc, extensions: [notesMarkdown, keepMarksWhole] });

  ensureSyntaxTree(state, state.doc.length, 5000);

  const from = doc.indexOf(part);
  const after = state.update({ changes: { from, to: from + part.length }, selection: { anchor: from }, userEvent }).state;
  const head = after.selection.main.head;
  const text = after.doc.toString();

  return `${text.slice(0, head)}|${text.slice(head)}`;
}

describe("deleting inside a highlight", () => {
  it("keeps it a highlight when its last letter goes after a space", () => {
    expect(deleting("Is it ==fast ?=={exam} now", "?")).toBe("Is it ==fast|=={exam}  now");
    expect(deleting("Is it ==fast ?== now", "?")).toBe("Is it ==fast|==  now");
  });

  it("keeps it a highlight when its first letter goes before a space", () => {
    expect(deleting("A ==b fast=={question}", "b")).toBe("A  ==|fast=={question}");
  });

  it("leaves a deletion that keeps the highlight whole alone", () => {
    expect(deleting("A ==fast?=={exam}", "?")).toBe("A ==fast|=={exam}");
  });

  it("leaves highlights in code, and typing, alone", () => {
    expect(deleting("Use `==a ?==` here", "?")).toBe("Use `==a |==` here");
    expect(deleting("A ==fast ?== b", "?", "input.type")).toBe("A ==fast |== b");
  });
});
