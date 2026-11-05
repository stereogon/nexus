import { describe, expect, it } from "vitest";

import type { Annotation } from "../ipc/annotations";
import type { VaultMarks } from "../ipc/search";
import type { LectureRow } from "../ipc/vault";
import { facetChoices, libraryGroups, NO_FILTER, type LibraryFilter } from "./highlightLibrary";

function lecture(directory: string, week: string, module = "Consensus"): LectureRow {
  return {
    directory,
    title: directory,
    sequence: "a0",
    course: "CS 454",
    module,
    week,
    tags: [],
    conversion: "notRequired",
    documentReady: true,
  };
}

function highlight(id: string, page: number, y: number, semantic: "key" | "exam", quote: string): Annotation {
  return {
    kind: "textHighlight",
    id,
    page,
    semantic,
    quote,
    rects: [{ x: 0.1, y, width: 0.5, height: 0.03 }],
    createdAt: "2026-11-05T09:00:00Z",
    updatedAt: "2026-11-05T09:00:00Z",
  };
}

const STICKY: Annotation = {
  kind: "textBox",
  id: "tb-1",
  page: 1,
  region: { x: 0.6, y: 0.1, width: 0.2, height: 0.1 },
  text: "Ask about leases",
  createdAt: "2026-11-05T09:00:00Z",
  updatedAt: "2026-11-05T09:00:00Z",
};

const LECTURES = [lecture("raft", "Week 3"), lecture("paxos", "Week 4", "Agreement"), lecture("empty", "Week 3")];

const MARKS: VaultMarks = {
  lectures: [
    // Stored out of reading order on purpose.
    { directory: "raft", annotations: [highlight("r2", 2, 0.1, "exam", "Log matching"), highlight("r1", 1, 0.5, "key", "Leader election"), STICKY] },
    { directory: "paxos", annotations: [highlight("p1", 1, 0.2, "exam", "Prepare and promise")] },
  ],
  unreadable: 0,
};

const ids = (filter: LibraryFilter) =>
  libraryGroups(MARKS, LECTURES, filter).map((group) => [group.lecture.directory, group.marks.map((mark) => mark.id)]);

describe("the highlights library", () => {
  it("shows everything with no filter, by lecture in sidebar order, in reading order", () => {
    expect(ids(NO_FILTER)).toEqual([
      ["raft", ["tb-1", "r1", "r2"]],
      ["paxos", ["p1"]],
    ]);
  });

  it("keeps only the chosen meanings", () => {
    expect(ids({ ...NO_FILTER, kinds: new Set(["exam"]) })).toEqual([
      ["raft", ["r2"]],
      ["paxos", ["p1"]],
    ]);
  });

  it("can show sticky notes on their own", () => {
    expect(ids({ ...NO_FILTER, kinds: new Set(["sticky"]) })).toEqual([["raft", ["tb-1"]]]);
  });

  it("filters by the lecture's facets: every exam point in week 3", () => {
    expect(ids({ ...NO_FILTER, kinds: new Set(["exam"]), week: "Week 3" })).toEqual([["raft", ["r2"]]]);
    expect(ids({ ...NO_FILTER, module: "Agreement" })).toEqual([["paxos", ["p1"]]]);
  });

  it("filters by the words a highlight carries, ignoring case", () => {
    expect(ids({ ...NO_FILTER, text: "LEADER" })).toEqual([["raft", ["r1"]]]);
  });

  it("leaves out lectures with nothing kept", () => {
    expect(ids({ ...NO_FILTER, text: "nothing like this" })).toEqual([]);
  });

  it("offers only facet values that lectures with highlights have", () => {
    expect(facetChoices(MARKS, LECTURES)).toEqual({
      courses: ["CS 454"],
      modules: ["Agreement", "Consensus"],
      weeks: ["Week 3", "Week 4"],
    });
  });
});
