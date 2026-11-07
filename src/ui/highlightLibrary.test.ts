import { describe, expect, it } from "vitest";

import type { Annotation } from "../ipc/annotations";
import type { VaultMarks } from "../ipc/search";
import type { LectureRow } from "../ipc/vault";
import { folderChoices, libraryGroups, NO_FILTER, type LibraryFilter } from "./highlightLibrary";

function lecture(directory: string, week: string, module = "Consensus"): LectureRow {
  return {
    directory,
    kind: "document",
    title: directory,
    number: null,
    numberInTitle: null,
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

const LECTURES = [
  lecture("CS454/Week 3/raft", "Week 3"),
  lecture("CS454/Week 4/paxos", "Week 4", "Agreement"),
  lecture("Reading/empty", "Week 3"),
];
const RAFT = "CS454/Week 3/raft";
const PAXOS = "CS454/Week 4/paxos";

const MARKS: VaultMarks = {
  lectures: [
    // Stored out of reading order on purpose.
    { directory: RAFT, annotations: [highlight("r2", 2, 0.1, "exam", "Log matching"), highlight("r1", 1, 0.5, "key", "Leader election"), STICKY] },
    { directory: PAXOS, annotations: [highlight("p1", 1, 0.2, "exam", "Prepare and promise")] },
  ],
  unreadable: 0,
};

const ids = (filter: LibraryFilter) =>
  libraryGroups(MARKS, LECTURES, filter).map((group) => [group.lecture.directory, group.marks.map((mark) => mark.id)]);

describe("the highlights library", () => {
  it("shows everything with no filter, by lecture in sidebar order, in reading order", () => {
    expect(ids(NO_FILTER)).toEqual([
      [RAFT, ["tb-1", "r1", "r2"]],
      [PAXOS, ["p1"]],
    ]);
  });

  it("keeps only the chosen meanings", () => {
    expect(ids({ ...NO_FILTER, kinds: new Set(["exam"]) })).toEqual([
      [RAFT, ["r2"]],
      [PAXOS, ["p1"]],
    ]);
  });

  it("can show sticky notes on their own", () => {
    expect(ids({ ...NO_FILTER, kinds: new Set(["sticky"]) })).toEqual([[RAFT, ["tb-1"]]]);
  });

  it("filters by folder, at any depth inside it: every exam point in Week 3", () => {
    expect(ids({ ...NO_FILTER, kinds: new Set(["exam"]), folder: "CS454/Week 3" })).toEqual([[RAFT, ["r2"]]]);
    expect(ids({ ...NO_FILTER, folder: "CS454" }).map(([directory]) => directory)).toEqual([RAFT, PAXOS]);
  });

  it("does not take a folder for one whose name merely starts the same", () => {
    // `CS454/Week 3` must not keep `CS454/Week 30`.
    expect(ids({ ...NO_FILTER, folder: "CS454/Week" })).toEqual([]);
  });

  it("filters by the words a highlight carries, ignoring case", () => {
    expect(ids({ ...NO_FILTER, text: "LEADER" })).toEqual([[RAFT, ["r1"]]]);
  });

  it("leaves out lectures with nothing kept", () => {
    expect(ids({ ...NO_FILTER, text: "nothing like this" })).toEqual([]);
  });

  it("offers each folder above an item with highlights, and no others", () => {
    expect(folderChoices(MARKS, LECTURES)).toEqual(["CS454", "CS454/Week 3", "CS454/Week 4"]);
  });
});
