/**
 * Where "Link to notes" puts a citation, and where the cursor lands after.
 */
import { describe, expect, it } from "vitest";

import { citedIds } from "./citeLinks";
import { citationAt } from "./insert";

const BLOCK = '> 📌 **[Page 4](cite://hl-1)**: *"Raft"*';

/** The document after inserting at `at`, with the cursor marked `|`. */
function after(doc: string, at: number): string {
  const { text, cursor } = citationAt(doc, at, BLOCK);
  const result = doc.slice(0, at) + text + doc.slice(at);

  return `${result.slice(0, at + cursor)}|${result.slice(at + cursor)}`;
}

describe("a citation", () => {
  it("goes in as the first thing in an empty document", () => {
    expect(after("", 0)).toBe(`${BLOCK}\n\n|\n`);
  });

  it("gets a blank line before it when typed straight after a sentence", () => {
    // Otherwise the sentence and the quote run together.
    expect(after("Consensus is hard.", 18)).toBe(`Consensus is hard.\n\n${BLOCK}\n\n|\n`);
  });

  it("does not add a second blank line where one is already", () => {
    expect(after("Intro\n\n", 7)).toBe(`Intro\n\n${BLOCK}\n\n|\n`);
  });

  it("is kept apart from the paragraph after it", () => {
    // A line typed straight after a blockquote is read as part of it in Markdown.
    expect(after("\nNext paragraph.", 0)).toBe(`${BLOCK}\n\n|\nNext paragraph.`);
  });

  it("splits a line at the cursor rather than landing inside it", () => {
    expect(after("Before after", 7)).toBe(`Before \n\n${BLOCK}\n\n|\nafter`);
  });

  it("leaves the cursor on an empty line, ready for the next thought", () => {
    const doc = "Intro\n\n";
    const { text, cursor } = citationAt(doc, doc.length, BLOCK);
    const result = doc + text;
    const lineStart = result.lastIndexOf("\n", doc.length + cursor - 1) + 1;
    const lineEnd = result.indexOf("\n", doc.length + cursor);

    expect(result.slice(lineStart, lineEnd)).toBe("");
  });
});

describe("the ids cited in a note", () => {
  it("are found in order, repeats included", () => {
    expect(citedIds("see cite://hl-1 and (cite://ar_2) then cite://hl-1")).toEqual([
      "hl-1",
      "ar_2",
      "hl-1",
    ]);
  });

  it("use the same characters the Rust scanner accepts, and stop at anything else", () => {
    // ASCII letters, digits, `-` and `_` -- so the editor never badges something the
    // citation index would not recognise.
    expect(citedIds("cite://hl-1)**: and cite://x.y")).toEqual(["hl-1", "x"]);
  });

  it("find nothing in prose without a citation", () => {
    expect(citedIds("cite: not a link, nor is cite:/hl-1")).toEqual([]);
  });
});
