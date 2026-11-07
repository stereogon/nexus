import { describe, expect, it } from "vitest";

import type { VaultSearch } from "../ipc/search";
import type { LectureRow } from "../ipc/vault";
import { searchResults } from "./searchResults";

function item(directory: string, title: string, kind: LectureRow["kind"] = "document"): LectureRow {
  return {
    directory,
    kind,
    createdAt: "2026-11-01T09:00:00Z",
    title,
    number: null,
    numberInTitle: null,
    sequence: "a0",
    course: null,
    module: null,
    week: null,
    tags: [],
    conversion: "notRequired",
    documentReady: kind === "document",
  };
}

const LISTING = {
  folders: ["CS454", "CS454/Majority votes"],
  lectures: [item("CS454/raft", "Raft consensus"), item("Journal/plans", "Majority plans", "note")],
};

const FOUND: VaultSearch = {
  lectures: [
    {
      directory: "CS454/raft",
      notes: [{ line: 12, snippet: { before: "why a ", matched: "majority", after: "?" } }],
      noteLines: 1,
      marks: [{ id: "h1", page: 4, semantic: "exam", snippet: { before: "votes from a ", matched: "majority", after: "" } }],
    },
    { directory: "gone/item", notes: [{ line: 1, snippet: { before: "", matched: "majority", after: "" } }], noteLines: 1, marks: [] },
  ],
  unreadable: 0,
  truncated: false,
};

describe("the search window's results", () => {
  it("lists names, then lines of notes, then highlights, as one list", () => {
    const results = searchResults(LISTING, "majority", FOUND);

    expect(results.map((result) => [result.group, result.title, result.detail])).toEqual([
      ["names", "Majority votes", ""],
      ["names", "Majority plans", ""],
      ["notes", "Raft consensus", "line 12"],
      ["highlights", "Raft consensus", "page 4"],
    ]);
  });

  it("says where each result is, and what it is", () => {
    const [folder, note, line, mark] = searchResults(LISTING, "majority", FOUND);

    expect(folder?.where).toBe("CS454");
    expect(note?.look).toBe("note");
    expect(line?.where).toBe("CS454");
    expect(mark?.look).toBe("exam");
  });

  it("opens each where it belongs: a folder, an item, or a place inside one", () => {
    const [folder, note, line, mark] = searchResults(LISTING, "majority", FOUND);

    expect(folder?.target).toEqual({ kind: "folder", path: "CS454/Majority votes" });
    expect(note?.target.kind).toBe("item");
    expect(line?.target).toMatchObject({ kind: "place", at: { kind: "line", line: 12 } });
    expect(mark?.target).toMatchObject({ kind: "place", at: { kind: "highlight", id: "h1" } });
  });

  it("drops results for an item removed since the search was asked", () => {
    expect(searchResults(LISTING, "majority", FOUND).some((result) => result.key.includes("gone"))).toBe(false);
  });

  it("lists only names until the search inside items answers", () => {
    expect(searchResults(LISTING, "majority", null).every((result) => result.group === "names")).toBe(true);
  });
});
