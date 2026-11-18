/**
 * The notes' Markdown has no setext headings: a bullet begun under a line of text leaves it text.
 */
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { notesMarkdown, parsedWhole } from "./language";

/** The names of the blocks `doc` parses into, at the top. */
function blocks(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [notesMarkdown] });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  const names: string[] = [];

  for (let node = tree?.topNode.firstChild ?? null; node !== null; node = node.nextSibling) {
    names.push(node.name);
  }

  return names;
}

describe("the notes' Markdown", () => {
  it("reads a bullet begun under text as text, not as a heading's underline", () => {
    expect(blocks("Words above\n-")).toEqual(["Paragraph"]);
    expect(blocks("Words above\n- ")).toEqual(["Paragraph"]);
    expect(blocks("Words above\n- item")).toEqual(["Paragraph", "BulletList"]);
  });

  it("reads `=` under text as text and `---` as a rule", () => {
    expect(blocks("Words above\n===")).toEqual(["Paragraph"]);
    expect(blocks("Words above\n---")).toEqual(["Paragraph", "HorizontalRule"]);
  });

  it("still reads # headings", () => {
    expect(blocks("## Heading\ntext")).toEqual(["ATXHeading2", "Paragraph"]);
  });
});

describe("a state parsed whole", () => {
  // Far more than CodeMirror parses in the 20 ms it gives a new state, on any machine, so the
  // tree read from the state is the one this hands back, not the one it was made with.
  const long = Array.from({ length: 40_000 }, (_, index) => `${String(index + 1)}. item`).join("\n");

  it("answers syntaxTree with the whole document, not the part parsed at creation", () => {
    const state = parsedWhole(EditorState.create({ doc: long, extensions: [notesMarkdown] }));

    expect(syntaxTree(state).length).toBe(state.doc.length);
  });

  it("keeps the document and selection as they were", () => {
    const made = EditorState.create({ doc: "1. one\n2. two", selection: { anchor: 4 }, extensions: [notesMarkdown] });
    const state = parsedWhole(made);

    expect(state.doc.toString()).toBe("1. one\n2. two");
    expect(state.selection.main.head).toBe(4);
  });
});
