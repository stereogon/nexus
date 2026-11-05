/**
 * Formatting in the notes: what each button writes, and that pressing it again undoes it.
 */
import { describe, expect, it } from "vitest";

import { blockOf, hasInline, linkAround, setBlock, toggleInline, type Change } from "./format";

/** `doc` with `changes` applied, last first so earlier offsets stay right. */
function applied(doc: string, changes: readonly Change[]): string {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce((text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to ?? change.from), doc);
}

describe("bold, italic, strikethrough and code", () => {
  const doc = "Raft elects a leader.";

  it("wraps the selection in the Markdown anyone would type", () => {
    expect(applied(doc, toggleInline(doc, 14, 20, "bold"))).toBe("Raft elects a **leader**.");
    expect(applied(doc, toggleInline(doc, 14, 20, "italic"))).toBe("Raft elects a _leader_.");
    expect(applied(doc, toggleInline(doc, 14, 20, "strike"))).toBe("Raft elects a ~~leader~~.");
    expect(applied(doc, toggleInline(doc, 14, 20, "code"))).toBe("Raft elects a `leader`.");
  });

  it("is taken off again when pressed on formatted words", () => {
    const bold = "Raft elects a **leader**.";

    // The selection is on the words, as it is left after formatting them.
    expect(hasInline(bold, 16, 22, "bold")).toBe(true);
    expect(applied(bold, toggleInline(bold, 16, 22, "bold"))).toBe(doc);
  });

  it("is taken off when the selection includes the markers too", () => {
    const bold = "Raft elects a **leader**.";

    expect(applied(bold, toggleInline(bold, 14, 24, "bold"))).toBe(doc);
  });

  it("can be combined: italic inside bold is not mistaken for either", () => {
    const bold = "**leader**";
    const both = applied(bold, toggleInline(bold, 2, 8, "italic"));

    expect(both).toBe("**_leader_**");
    expect(hasInline(both, 3, 9, "bold")).toBe(false);
    expect(hasInline(both, 3, 9, "italic")).toBe(true);
  });

  it("trims the spaces at a selection's ends and formats each line on its own", () => {
    const two = " first \nsecond";

    expect(applied(two, toggleInline(two, 0, two.length, "bold"))).toBe(" **first** \n**second**");
  });

  it("inserts around the words rather than replacing them, so the selection can stay", () => {
    const changes = toggleInline(doc, 14, 20, "bold");

    expect(changes.every((change) => change.to === undefined)).toBe(true);
  });
});

describe("headings, lists and quotes", () => {
  it("turns a line into each kind of block", () => {
    expect(applied("Title", setBlock("Title", 0, 0, "h1"))).toBe("# Title");
    expect(applied("Title", setBlock("Title", 0, 0, "h3"))).toBe("### Title");
    expect(applied("Point", setBlock("Point", 0, 0, "bullet"))).toBe("- Point");
    expect(applied("Do it", setBlock("Do it", 0, 0, "task"))).toBe("- [ ] Do it");
    expect(applied("Said", setBlock("Said", 0, 0, "quote"))).toBe("> Said");
  });

  it("numbers a list from 1 across the selected lines", () => {
    const doc = "one\ntwo\nthree";

    expect(applied(doc, setBlock(doc, 0, doc.length, "numbered"))).toBe("1. one\n2. two\n3. three");
  });

  it("swaps one kind for another rather than stacking them", () => {
    expect(applied("# Title", setBlock("# Title", 2, 2, "h2"))).toBe("## Title");
    expect(applied("- Point", setBlock("- Point", 3, 3, "numbered"))).toBe("1. Point");
  });

  it("goes back to a paragraph when pressed again", () => {
    expect(applied("## Title", setBlock("## Title", 3, 3, "h2"))).toBe("Title");
  });

  it("keeps a nested item's indentation", () => {
    expect(applied("    - nested", setBlock("    - nested", 6, 6, "numbered"))).toBe("    1. nested");
  });

  it("reads what kind of block a line is, for the toolbar to show", () => {
    expect(["# a", "## a", "### a", "- a", "1. a", "- [x] a", "> a", "a"].map(blockOf)).toEqual([
      "h1",
      "h2",
      "h3",
      "bullet",
      "numbered",
      "task",
      "quote",
      "paragraph",
    ]);
  });
});

describe("a link", () => {
  it("wraps the words and leaves the cursor where the address is typed", () => {
    const doc = "See the paper here.";
    const { changes, cursor } = linkAround(doc, 4, 13);
    const after = applied(doc, changes);

    expect(after).toBe("See [the paper]() here.");
    expect(after.slice(cursor - 2, cursor + 1)).toBe("](" + ")");
  });
});
