import { describe, expect, it } from "vitest";

import { blockAt, headingsOf, moveBlock } from "./blocks";

const DOC = ["# Plans", "Buy milk", "```js", "let a = 1;", "# not a heading", "```", "| a | b |", "| - | - |", "| 1 | 2 |", "End"].join("\n");

describe("a line's block", () => {
  it("is the line itself, for ordinary lines", () => {
    expect(blockAt(DOC, 2)).toEqual({ from: 2, to: 2 });
  });

  it("is the whole fence, for any line of a code block", () => {
    expect(blockAt(DOC, 3)).toEqual({ from: 3, to: 6 });
    expect(blockAt(DOC, 5)).toEqual({ from: 3, to: 6 });
  });

  it("is the whole table, for any row", () => {
    expect(blockAt(DOC, 8)).toEqual({ from: 7, to: 9 });
  });

  it("runs an unclosed fence to the end", () => {
    expect(blockAt("a\n```\ncode", 3)).toEqual({ from: 2, to: 3 });
  });
});

describe("moving a block", () => {
  it("moves a line up, before another", () => {
    expect(moveBlock("a\nb\nc", { from: 3, to: 3 }, 1)).toEqual({ text: "c\na\nb", line: 1 });
  });

  it("moves a line down, before another, counting from where things were", () => {
    expect(moveBlock("a\nb\nc\nd", { from: 1, to: 1 }, 4)).toEqual({ text: "b\nc\na\nd", line: 3 });
  });

  it("moves to the end with one past the last line", () => {
    expect(moveBlock("a\nb\nc", { from: 1, to: 1 }, 4)).toEqual({ text: "b\nc\na", line: 3 });
  });

  it("moves a whole code block together", () => {
    const moved = moveBlock(DOC, blockAt(DOC, 4), 2);

    expect(moved.text.split("\n").slice(0, 6)).toEqual(["# Plans", "```js", "let a = 1;", "# not a heading", "```", "Buy milk"]);
    expect(moved.line).toBe(2);
  });

  it("changes nothing when dropped on itself or just after itself", () => {
    expect(moveBlock("a\nb\nc", { from: 2, to: 2 }, 2).text).toBe("a\nb\nc");
    expect(moveBlock("a\nb\nc", { from: 2, to: 2 }, 3).text).toBe("a\nb\nc");
  });

  it("keeps every line, only reordered", () => {
    const moved = moveBlock(DOC, { from: 7, to: 9 }, 1);

    expect([...moved.text.split("\n")].sort()).toEqual([...DOC.split("\n")].sort());
  });
});

describe("the headings", () => {
  it("lists headings with their levels, leaving out lookalikes in code", () => {
    expect(headingsOf("# One\ntext\n## Two ##\n```\n# code\n```\n### Three")).toEqual([
      { line: 1, level: 1, text: "One" },
      { line: 3, level: 2, text: "Two" },
      { line: 7, level: 3, text: "Three" },
    ]);
  });

  it("does not take a hash with no space for a heading", () => {
    expect(headingsOf("#hashtag")).toEqual([]);
  });
});
