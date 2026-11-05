/**
 * Highlighting text in the notes: finding marks, and what marking a selection changes.
 */
import { describe, expect, it } from "vitest";

import { markChanges, marked, marksIn } from "./marks";

/** `doc` with `changes` applied, last first so earlier offsets stay right. */
function applied(doc: string, changes: ReturnType<typeof markChanges>): string {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce((text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to), doc);
}

describe("finding marks", () => {
  it("reads ==text== as a key concept", () => {
    expect(marksIn("A ==leader== is elected.")).toEqual([
      { from: 2, to: 12, innerFrom: 4, innerTo: 10, semantic: "key" },
    ]);
  });

  it("reads the meaning after a mark", () => {
    expect(marksIn("==quorum=={definition} and ==term 3=={exam}").map((mark) => mark.semantic)).toEqual([
      "definition",
      "exam",
    ]);
  });

  it("does not read == with spaces just inside it as a mark", () => {
    // `a == b == c` is an equation in prose, not a highlight.
    expect(marksIn("if a == b == c then")).toEqual([]);
  });

  it("leaves an unknown meaning as text after a key mark", () => {
    const [mark] = marksIn("==x=={purple}");

    expect(mark).toMatchObject({ semantic: "key", to: 5 });
  });
});

describe("marking a selection", () => {
  it("wraps it, in the form the finder reads back", () => {
    const doc = "Raft elects a leader.";

    expect(applied(doc, markChanges(doc, 14, 20, "exam"))).toBe("Raft elects a ==leader=={exam}.");
    expect(marksIn(marked("leader", "exam"))[0]?.semantic).toBe("exam");
  });

  it("trims the spaces at a selection's ends, which would stop it being a mark", () => {
    const doc = "Raft elects a leader.";

    expect(applied(doc, markChanges(doc, 11, 21, "key"))).toBe("Raft elects ==a leader.==");
  });

  it("marks each line of a selection on its own", () => {
    const doc = "first line\nsecond line";

    expect(applied(doc, markChanges(doc, 0, doc.length, "question"))).toBe(
      "==first line=={question}\n==second line=={question}",
    );
  });

  it("recolours a mark instead of nesting a new one inside it", () => {
    const doc = "a ==leader=={exam} b";

    expect(applied(doc, markChanges(doc, 4, 10, "definition"))).toBe("a ==leader=={definition} b");
  });

  it("removes a mark, keeping its words", () => {
    const doc = "a ==leader=={exam} b";

    expect(applied(doc, markChanges(doc, 5, 7, null))).toBe("a leader b");
  });

  it("does nothing when asked to remove a mark that is not there", () => {
    expect(markChanges("plain words", 0, 5, null)).toEqual([]);
  });
});
