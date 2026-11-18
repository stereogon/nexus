// @vitest-environment jsdom
/**
 * Where the cursor may stand with the marks hidden, and what Backspace does at an element's
 * edge. Against real editor states with the GFM parser, so the code blocks are the parser's.
 */
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { blockKeys, settled } from "./blockKeys";
import { hiddenPrefix } from "./format";
import { parsedWhole } from "./language";

const CITE = '> 📌 **[Page 4](cite://hl-1)**: *"Raft"*';

function stateOf(doc: string): EditorState {
  return parsedWhole(EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] }));
}

const lineStart = (state: EditorState, line: number) => state.doc.line(line).from;

describe("where a cursor settles", () => {
  it("past a heading's hidden mark, never in front of it", () => {
    const state = stateOf("# Plans\ntext");

    expect(settled(state, 0, true)).toBe(2);
    expect(settled(state, 4, true)).toBe(4);
  });

  it("past a to-do's hidden mark and box, from anywhere inside them", () => {
    const state = stateOf("- [ ] Milk");

    expect(settled(state, 2, false)).toBe(6);
  });

  it("up a line, going back from the start of a heading's words", () => {
    const state = stateOf("text\n# Plans");
    const words = lineStart(state, 2) + 2;

    expect(settled(state, lineStart(state, 2), false, words)).toBe(state.doc.line(1).to);
    expect(settled(state, lineStart(state, 2), false, words + 3)).toBe(words);
  });

  it("off a citation, the way it was going", () => {
    const state = stateOf(`above\n${CITE}\nbelow`);
    const on = lineStart(state, 2) + 3;

    expect(settled(state, on, true)).toBe(lineStart(state, 3));
    expect(settled(state, on, false)).toBe(state.doc.line(1).to);
  });

  it("off a code block's fences: into it from above, out of it below", () => {
    const state = stateOf("above\n```js\nlet a = 1;\n```\nbelow");

    expect(settled(state, lineStart(state, 2), true)).toBe(lineStart(state, 3));
    expect(settled(state, lineStart(state, 4), true)).toBe(lineStart(state, 5));
    expect(settled(state, lineStart(state, 4), false)).toBe(state.doc.line(3).to);
  });
});

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

/** Presses Backspace with the cursor at `at`, and answers the notes after. */
function backspaceAt(doc: string, at: (state: EditorState) => number): string {
  const state = stateOf(doc);

  view = new EditorView({
    parent: document.body,
    state: parsedWhole(EditorState.create({ doc, selection: { anchor: at(state) }, extensions: [markdown({ base: markdownLanguage }), blockKeys] })),
  });
  runScopeHandlers(view, new KeyboardEvent("keydown", { key: "Backspace" }), "editor");

  return view.state.doc.toString();
}

describe("Backspace at an element's edge", () => {
  it("moves a heading up over a blank line, still a heading", () => {
    expect(backspaceAt("Intro\n\n## Plans\nAfter", (state) => lineStart(state, 3) + 3)).toBe("Intro\n## Plans\nAfter");
  });

  it("leaves a heading under words to CodeMirror, which makes it text", () => {
    expect(backspaceAt("Intro\n## Plans", (state) => lineStart(state, 2) + 3)).toBe("Intro\n## Plans");
  });

  it("removes a citation whole from the start of the line after it", () => {
    expect(backspaceAt(`above\n${CITE}\nbelow`, (state) => lineStart(state, 3))).toBe("above\nbelow");
  });

  it("removes an empty code block, and leaves a written one alone", () => {
    expect(backspaceAt("a\n```\n\n```\nb", (state) => lineStart(state, 3))).toBe("a\nb");
    expect(backspaceAt("a\n```\ncode\n```\nb", (state) => lineStart(state, 3))).toBe("a\n```\ncode\n```\nb");
  });

  it("goes into a code block's last line from just after it, rather than its fence", () => {
    const doc = "```\ncode\n```\nafter";
    const state = stateOf(doc);

    backspaceAt(doc, () => lineStart(state, 4));

    expect(view?.state.doc.toString()).toBe(doc);
    expect(view?.state.selection.main.head).toBe(state.doc.line(2).to);
  });
});

describe("the hidden part of a line's start", () => {
  it("counts a heading, list, number, to-do or quote mark, with a nested list's indent", () => {
    expect(hiddenPrefix("## Plans")).toBe(3);
    expect(hiddenPrefix("- [ ] milk")).toBe(6);
    expect(hiddenPrefix("> quote")).toBe(2);
    expect(hiddenPrefix("1. first")).toBe(3);
    expect(hiddenPrefix("   10. tenth")).toBe(7);
    expect(hiddenPrefix("plain")).toBe(0);
  });
});
