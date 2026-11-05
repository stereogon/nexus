/**
 * The pure rules about a lecture's annotation list (`annotationList.ts`).
 *
 * Both are about the same thing: the window counts pages from zero and the file counts
 * from one. An off-by-one either way stores or shows highlights on the wrong page, which
 * nothing notices until someone reopens the lecture.
 */
import { describe, expect, it } from "vitest";

import type { Annotation } from "../ipc/annotations";
import { asNewHighlight, onPage, withChange } from "./annotationList";

const CANDIDATE = {
  pageIndex: 3,
  rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.03 }],
  quote: "a quorum is a majority",
};

function stored(id: string, page: number): Annotation {
  return {
    kind: "textHighlight",
    id,
    page,
    semantic: "key",
    quote: "x",
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.03 }],
    createdAt: "2026-10-27T16:00:00Z",
    updatedAt: "2026-10-27T16:00:00Z",
  };
}

describe("turning a candidate into a request", () => {
  it("counts the page from one, as the file does", () => {
    expect(asNewHighlight(CANDIDATE, "exam").page).toBe(4);
  });

  it("makes the first page page one, not page zero", () => {
    // Zero is refused by Rust, so this off-by-one would fail loudly rather than quietly
    // -- but only for the first page, which is exactly the one nobody tests by hand.
    expect(asNewHighlight({ ...CANDIDATE, pageIndex: 0 }, "key").page).toBe(1);
  });

  it("passes the semantic, quote and rectangles through unchanged", () => {
    const asked = asNewHighlight(CANDIDATE, "question");

    expect(asked.semantic).toBe("question");
    expect(asked.quote).toBe("a quorum is a majority");
    expect(asked.rects).toEqual(CANDIDATE.rects);
  });
});

describe("finding one page's highlights", () => {
  const all = [stored("a", 1), stored("b", 4), stored("c", 4), stored("d", 7)];

  it("matches the file's page against the window's index", () => {
    expect(onPage(all, 3).map((a) => a.id)).toEqual(["b", "c"]);
  });

  it("finds the first page's highlights at index zero", () => {
    expect(onPage(all, 0).map((a) => a.id)).toEqual(["a"]);
  });

  it("finds none on a page with none, rather than falling back to any", () => {
    expect(onPage(all, 2)).toEqual([]);
    expect(onPage([], 0)).toEqual([]);
  });
});

describe("the list after a change", () => {
  const KEY: Annotation = {
    kind: "textHighlight",
    id: "hl-1",
    page: 1,
    semantic: "key",
    quote: "Raft achieves consensus.",
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    createdAt: "2026-10-27T16:00:00Z",
    updatedAt: "2026-10-27T16:00:00Z",
  };
  const OTHER: Annotation = { ...KEY, id: "hl-2" };

  it("holds the stored version in place of the old one", () => {
    const stored: Annotation = { ...KEY, semantic: "exam", updatedAt: "2026-11-05T09:30:00Z" };

    expect(withChange([KEY, OTHER], "hl-1", stored)).toEqual([stored, OTHER]);
  });

  it("keeps the order, so a recoloured highlight does not jump in the list", () => {
    const stored: Annotation = { ...OTHER, semantic: "question" };

    expect(withChange([KEY, OTHER], "hl-2", stored).map((a) => a.id)).toEqual(["hl-1", "hl-2"]);
  });

  it("adds one it did not hold, as an undone removal brings back", () => {
    expect(withChange([KEY], "hl-2", OTHER)).toEqual([KEY, OTHER]);
  });

  it("stops drawing a highlight the lecture no longer has", () => {
    // `null` from the backend: removed on another device between the click and the write.
    expect(withChange([KEY, OTHER], "hl-1", null)).toEqual([OTHER]);
  });
});
