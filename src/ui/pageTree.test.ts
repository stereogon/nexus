/**
 * An item's pages read as a tree: the path to one, what is inside a note, and which note
 * cites a highlight.
 */
import { describe, expect, it } from "vitest";

import type { PageSummary } from "../ipc/pages";
import { citedAnywhere, noteCiting, pagesIn, pagesInside, pathTo, type NoteKey } from "./pageTree";

function page(id: string, parent: string | null): PageSummary {
  return { id, title: id.toUpperCase(), parent, created: "2026-11-14T09:00:00Z", cites: [] };
}

// a and d at the top; b inside a; c inside b.
const PAGES = [page("a", null), page("b", "a"), page("c", "b"), page("d", null)];

describe("the path to a page", () => {
  it("runs from the top down to it", () => {
    expect(pathTo(PAGES, "c").map((at) => at.id)).toEqual(["a", "b", "c"]);
  });

  it("is empty for a page there is not", () => {
    expect(pathTo(PAGES, "z")).toEqual([]);
  });

  it("ends on a cycle a hand-edited file made, rather than looping", () => {
    const looped = [page("x", "y"), page("y", "x")];

    expect(pathTo(looped, "x").map((at) => at.id)).toEqual(["y", "x"]);
  });
});

describe("what is inside a note", () => {
  it("is the pages directly in it, for the item's notes and for a page", () => {
    expect(pagesIn(PAGES, null).map((at) => at.id)).toEqual(["a", "d"]);
    expect(pagesIn(PAGES, "a").map((at) => at.id)).toEqual(["b"]);
  });

  it("counts every depth for a delete, not the page itself", () => {
    expect(pagesInside(PAGES, "a")).toBe(2);
    expect(pagesInside(PAGES, "c")).toBe(0);
  });

  it("counts a cycle once", () => {
    expect(pagesInside([page("x", "y"), page("y", "x")], "x")).toBe(1);
  });
});

describe("which note cites a highlight", () => {
  const cites = new Map<NoteKey, ReadonlySet<string>>([
    [null, new Set(["hl-1"])],
    ["a", new Set(["hl-1", "hl-2"])],
  ]);

  it("is the open note when it does", () => {
    expect(noteCiting(cites, "hl-1", "a")).toBe("a");
  });

  it("is the first other note that does when the open one does not", () => {
    expect(noteCiting(cites, "hl-1", "d")).toBeNull();
    expect(noteCiting(cites, "hl-2", null)).toBe("a");
  });

  it("is none when no note does", () => {
    expect(noteCiting(cites, "hl-9", null)).toBeUndefined();
  });

  it("makes the item's cited set the union of every note's", () => {
    expect(citedAnywhere(cites)).toEqual(new Set(["hl-1", "hl-2"]));
  });
});
