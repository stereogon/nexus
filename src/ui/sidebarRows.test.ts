import { describe, expect, it } from "vitest";

import type { ConversionState, LectureRow } from "../ipc/vault";
import { groupingFrom, sidebarRows, type SidebarRow } from "./sidebarRows";

function lecture(over: Partial<LectureRow> & { directory: string }): LectureRow {
  return {
    title: "Raft Consensus",
    sequence: "a0",
    course: null,
    module: null,
    week: null,
    tags: [],
    conversion: "ready" satisfies ConversionState,
    documentReady: true,
    ...over,
  };
}

/** The shape of the list, as `depth:label` per row, which is what the eye sees. */
function shape(rows: readonly SidebarRow[]): string[] {
  return rows.map((row) =>
    row.kind === "group"
      ? `${String(row.depth)}:${row.label}`
      : `${String(row.depth)}:· ${row.lecture.title}`,
  );
}

describe("grouping by folder", () => {
  it("nests a heading per folder and puts lectures under them", () => {
    const rows = sidebarRows([
        lecture({ directory: "CS454/Week 03/01-raft", title: "Raft", sequence: "a0" }),
        lecture({ directory: "CS454/Week 03/02-elect", title: "Election", sequence: "a1" }),
        lecture({ directory: "CS454/Week 04/01-clocks", title: "Clocks", sequence: "a2" }),
      ],
      "folder",
      "none",
      "",
    );

    expect(shape(rows)).toEqual([
      "0:CS454",
      "1:Week 03",
      "2:· Raft",
      "2:· Election",
      "1:Week 04",
      "2:· Clocks",
    ]);
  });

  it("does not repeat a heading for a run of lectures in one folder", () => {
    // The reason headings are emitted on divergence rather than per lecture.
    const rows = sidebarRows(
      [
        lecture({ directory: "CS454/01-a", title: "A", sequence: "a0" }),
        lecture({ directory: "CS454/02-b", title: "B", sequence: "a1" }),
      ],
      "folder",
      "none",
      "",
    );

    expect(rows.filter((row) => row.kind === "group")).toHaveLength(1);
  });

  it("re-opens a heading when a later lecture returns to that folder", () => {
    // Out of sequence order on purpose: `sequence` decides, so the Week 03 lectures are
    // not adjacent in the input and must still end up under one heading each.
    const rows = sidebarRows(
      [
        lecture({ directory: "CS454/Week 04/01-c", title: "C", sequence: "a2" }),
        lecture({ directory: "CS454/Week 03/01-a", title: "A", sequence: "a0" }),
        lecture({ directory: "CS454/Week 03/02-b", title: "B", sequence: "a1" }),
      ],
      "folder",
      "none",
      "",
    );

    expect(shape(rows)).toEqual([
      "0:CS454",
      "1:Week 03",
      "2:· A",
      "2:· B",
      "1:Week 04",
      "2:· C",
    ]);
  });

  it("puts a lecture at the vault root at depth zero with no heading", () => {
    const rows = sidebarRows([lecture({ directory: "loose" })], "folder", "none", "");

    expect(shape(rows)).toEqual(["0:· Raft Consensus"]);
  });
});

describe("the row's own columns", () => {
  it("shows the folder's number prefix", () => {
    const rows = sidebarRows([lecture({ directory: "w3/01-raft" })], "folder", "none", "");
    const row = rows.find((candidate) => candidate.kind === "lecture");

    expect(row?.kind === "lecture" && row.num).toBe("01");
  });

  it("shows no number for a folder without a prefix", () => {
    const rows = sidebarRows([lecture({ directory: "raft-paper" })], "folder", "none", "");
    const row = rows.find((candidate) => candidate.kind === "lecture");

    expect(row?.kind === "lecture" && row.num).toBe("");
  });

  it("says what a lecture is waiting for, and nothing when it is ready", () => {
    const states: readonly (readonly [ConversionState, string])[] = [
      ["converting", "Converting"],
      ["queued", "Queued"],
      ["failed", "Failed"],
      ["ready", ""],
      ["notRequired", ""],
    ];

    for (const [conversion, expected] of states) {
      const rows = sidebarRows([lecture({ directory: "a", conversion })], "folder", "none", "");
      const row = rows.find((candidate) => candidate.kind === "lecture");

      expect(row?.kind === "lecture" && row.meta).toBe(expected);
    }
  });
});

describe("searching", () => {
  const vault = [
    lecture({ directory: "cs454/01-raft", title: "Raft Consensus", course: "CS454" }),
    lecture({ directory: "cs454/02-paxos", title: "Paxos", course: "CS454", sequence: "a1" }),
    lecture({ directory: "bio/01-cells", title: "Cells", course: "BIO101", sequence: "a2" }),
  ];

  it("keeps the lectures that match and drops the headings left empty", () => {
    const rows = sidebarRows(vault, "folder", "none", "paxos");

    expect(shape(rows)).toEqual(["0:cs454", "1:· Paxos"]);
  });

  it("ignores case and matches on a facet or a path, not only the title", () => {
    expect(sidebarRows(vault, "folder", "none", "BIO").length).toBeGreaterThan(0);
    expect(sidebarRows(vault, "folder", "none", "bio101")).toHaveLength(2);
    expect(sidebarRows(vault, "folder", "none", "02-paxos")).toHaveLength(2);
  });

  it("returns nothing when nothing matches, rather than everything", () => {
    expect(sidebarRows(vault, "folder", "none", "thermodynamics")).toEqual([]);
  });

  it("treats blank typing as no search at all", () => {
    expect(sidebarRows(vault, "folder", "none", "   ")).toHaveLength(sidebarRows(vault, "folder", "none", "").length);
  });

  it("matches a tag, which is how a tag search is meant to work", () => {
    const tagged = [lecture({ directory: "a", tags: ["exam-2"] })];

    expect(sidebarRows(tagged, "folder", "none", "exam")).toHaveLength(1);
  });
});

describe("the grouping a stored value names", () => {
  it("takes the canvas's four", () => {
    expect(groupingFrom("folder")).toBe("folder");
    expect(groupingFrom("week")).toBe("week");
    expect(groupingFrom("module")).toBe("module");
    expect(groupingFrom("tag")).toBe("tag");
  });

  it("falls back to Folder rather than throwing on anything else", () => {
    // The value can come from a hand-edited settings file, so it is not to be trusted.
    expect(groupingFrom("none")).toBe("folder");
    expect(groupingFrom("")).toBe("folder");
  });
});
