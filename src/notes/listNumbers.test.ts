/**
 * A numbered list's numbers: counted from its shape, a, b, c one level in, and written
 * back to the file's digits when Tab moves lines between levels.
 */
import { ensureSyntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { listLabel, renumbered } from "./listNumbers";
import { markupDecorations } from "./preview/markup";
import { NumberWidget } from "./preview/markupWidgets";

function stateOf(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });

  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

/** The labels the notes draw, top to bottom. */
function labels(doc: string): string[] {
  return markupDecorations(stateOf(doc), () => false).decorations.flatMap((range) => {
    const spec: unknown = range.value.spec;
    const widget = typeof spec === "object" && spec !== null && "widget" in spec ? spec.widget : null;

    return widget instanceof NumberWidget ? [widget.label] : [];
  });
}

function applied(doc: string): string {
  const state = stateOf(doc);

  return state.update({ changes: renumbered(state) }).state.doc.toString();
}

describe("a list's labels", () => {
  it("count 1, 2 at the top, a, b one level in, i, ii the level below", () => {
    expect(listLabel(3, 0)).toBe("3.");
    expect(listLabel(2, 1)).toBe("b.");
    expect(listLabel(28, 1)).toBe("ab.");
    expect(listLabel(4, 2)).toBe("iv.");
  });

  it("are drawn from the list's shape, not the digits written", () => {
    const doc = "1. one\n   2. sub\n   3. sub two\n7. two";

    expect(labels(doc)).toEqual(["1.", "a.", "b.", "2."]);
  });

  it("start a top-level list where its first item says", () => {
    expect(labels("5. five\n9. six")).toEqual(["5.", "6."]);
  });

  it("count a nested list under a bullet from a", () => {
    expect(labels("- point\n  1. sub\n  2. sub")).toEqual(["a.", "b."]);
  });
});

describe("renumbering the file", () => {
  it("writes a nested list's digits from 1, and the list it left on without it", () => {
    expect(applied("1. one\n   2. sub\n   3. sub two\n4. two")).toBe("1. one\n   1. sub\n   2. sub two\n2. two");
  });

  it("changes nothing that is already counted right", () => {
    expect(renumbered(stateOf("1. one\n2. two\n   1. a"))).toEqual([]);
  });
});
