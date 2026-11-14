// @vitest-environment jsdom
/**
 * Ordinary Markdown, rendered in place: which markup is hidden, and what is drawn, on and
 * off the cursor's line. Run against a real CodeMirror state with the GFM parser, so the
 * node names are the parser's own.
 */
import { ensureSyntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { markupDecorations } from "./markup";

/** The note, with the cursor at the end of line `cursorLine` (1-based). */
function render(
  doc: string,
  cursorLine: number,
  claimed: (from: number, to: number) => boolean = () => false,
  /** Where the cursor is, if not at the end of `cursorLine`. */
  at?: number,
) {
  const draft = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
  const state = draft.update({ selection: EditorSelection.cursor(at ?? draft.doc.line(cursorLine).to) }).state;

  ensureSyntaxTree(state, state.doc.length, 5000);

  const { decorations, tables } = markupDecorations(state, claimed);
  const replaced = decorations
    .filter((range) => range.from !== range.to)
    .map((range) => doc.slice(range.from, range.to));
  const lines = decorations
    .filter((range) => range.from === range.to)
    .map((range) => {
      // `spec` is typed `any` by CodeMirror; narrowed from `unknown` rather than trusted.
      const spec: unknown = range.value.spec;
      const cls = typeof spec === "object" && spec !== null && "class" in spec ? String(spec.class) : "";

      return { line: state.doc.lineAt(range.from).number, cls };
    });

  // Marks over words, by the class they give them.
  const marks = decorations
    .filter((range) => range.from !== range.to)
    .flatMap((range) => {
      const spec: unknown = range.value.spec;

      return typeof spec === "object" && spec !== null && "class" in spec
        ? [{ text: doc.slice(range.from, range.to), cls: String(spec.class) }]
        : [];
    });

  return { replaced, lines, marks, tables };
}

const END = "\n\nThe end.";
const last = (doc: string) => doc.split("\n").length;

describe("off the cursor's line", () => {
  it("hides a heading's marks and the space after them", () => {
    const doc = `## Week 2${END}`;

    expect(render(doc, last(doc)).replaced).toContain("## ");
  });

  it("hides emphasis marks, keeping the words", () => {
    const doc = `Raft elects a **leader** and *followers*.${END}`;

    expect(render(doc, last(doc)).replaced).toEqual(["**", "**", "*", "*"]);
  });

  it("draws a quote with a bar and hides its marker", () => {
    // Reported: `>` only dimmed the text.
    const doc = `> Consensus is hard.${END}`;
    const { replaced, lines } = render(doc, last(doc));

    expect(replaced).toContain("> ");
    expect(lines).toContainEqual({ line: 1, cls: "md-quote" });
  });

  it("draws an item's indent, mark and space as its marker, and hangs its line", () => {
    const doc = `- first\n  - nested\n1. second${END}`;
    const { replaced, lines } = render(doc, last(doc));

    expect(replaced).toEqual(["- ", "  - ", "1. "]);
    expect(lines.filter((line) => line.cls === "md-li").map((line) => line.line)).toEqual([1, 2, 3]);
  });

  it("draws only the mark of a list inside a quote, which keeps its `>`", () => {
    const doc = `> - quoted${END}`;

    expect(render(doc, last(doc)).replaced).toContain("-");
  });

  it("draws a task as its box alone, with no bullet beside it", () => {
    const doc = `- [ ] read the paper${END}`;
    const { replaced } = render(doc, last(doc));

    expect(replaced).toContain("[ ]");
    // The list's `-` (and its space) goes, rather than becoming a bullet.
    expect(replaced).toContain("- ");
  });

  it("strikes through a done task's words, and not an open one's", () => {
    const doc = `- [x] read the paper\n- [ ] write it up${END}`;
    const { marks } = render(doc, last(doc));

    expect(marks).toContainEqual({ text: " read the paper", cls: "md-done" });
    expect(marks.some((mark) => mark.text.includes("write it up"))).toBe(false);
  });

  it("keeps a link's words and hides its address", () => {
    const doc = `See [the paper](https://raft.github.io) now.${END}`;
    const { replaced } = render(doc, last(doc));

    expect(replaced).toContain("https://raft.github.io");
    expect(replaced).not.toContain("the paper");
  });

  it("draws a table as a table", () => {
    // Reported: a table was not recognised at all.
    const doc = `| A | B |\n|---|--:|\n| 1 | 2 |${END}`;
    const { tables } = render(doc, last(doc));

    expect(tables).toHaveLength(1);
    expect(doc.slice(tables[0]?.from, tables[0]?.to)).toBe("| A | B |\n|---|--:|\n| 1 | 2 |");
  });

  it("draws a rule for ---", () => {
    const doc = `Above\n\n---\n\nBelow${END}`;

    expect(render(doc, last(doc)).replaced).toContain("---");
  });
});

describe("on the cursor's line", () => {
  it("keeps the marks hidden there too, as Notion does (2026-11-07)", () => {
    // Until 2026-11-07 the cursor's line showed its Markdown; the user asked for the marks
    // to stay out of sight while still being Markdown underneath.
    const doc = "## Week **2**";

    expect(render(doc, 1).replaced).toEqual(["## ", "**", "**"]);
  });

  it("shows a link's address only while the cursor is inside the link", () => {
    const doc = `See [the paper](https://raft.github.io) now.${END}`;
    const inside = render(doc, 1, () => false, doc.indexOf("paper"));
    const outside = render(doc, 1);

    expect(inside.replaced).not.toContain("https://raft.github.io");
    expect(outside.replaced).toContain("https://raft.github.io");
  });

  it("keeps a table drawn with the cursor in it, since it is edited where it is drawn", () => {
    const doc = `| A | B |\n|---|---|\n| 1 | 2 |${END}`;
    const { tables, lines } = render(doc, 3);

    expect(tables).toHaveLength(1);
    expect(lines.filter((line) => line.cls === "md-table-source")).toHaveLength(0);
  });

  it("leaves a rule as text while the cursor is inside it, as bold chosen on an empty line is", () => {
    // Bold before writing puts `****` on the line with the cursor between the pairs; drawn
    // as a rule, what was typed next went after it instead of between the marks.
    const doc = `Above\n****${END}`;
    const between = render(doc, 2, () => false, doc.indexOf("****") + 2);

    expect(between.replaced).not.toContain("****");
    expect(render(doc, 2).replaced).toContain("****");
  });

  it("still draws the quote's bar, so a quote being edited still reads as one", () => {
    const doc = "> editing this";

    expect(render(doc, 1).lines).toContainEqual({ line: 1, cls: "md-quote" });
  });
});

describe("ranges the other previews draw", () => {
  it("are left alone, so two decorations never fight over one range", () => {
    const doc = `> 📌 **[Page 4](cite://hl-1)**: *"Raft"*${END}`;
    const citation = { from: 0, to: doc.indexOf("\n") };
    const { replaced, lines } = render(doc, last(doc), (from, to) => from >= citation.from && to <= citation.to);

    expect(replaced).toEqual([]);
    expect(lines).toEqual([]);
  });
});
