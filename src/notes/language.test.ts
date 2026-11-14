/**
 * The notes' Markdown has no setext headings: a bullet begun under a line of text leaves it text.
 */
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { notesMarkdown } from "./language";

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
