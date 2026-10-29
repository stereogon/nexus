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
    const rows = sidebarRows(
      [
        lecture({ directory: "CS454/Week 03/01-raft", title: "Raft", sequence: "a0" }),
        lecture({ directory: "CS454/Week 03/02-elect", title: "Election", sequence: "a1" }),
        lecture({ directory: "CS454/Week 04/01-clocks", title: "Clocks", sequence: "a2" }),
      ],
      "folder",
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
    const rows = sidebarRows([lecture({ directory: "loose" })], "folder", "");

    expect(shape(rows)).toEqual(["0:· Raft Consensus"]);
  });
});

describe("grouping by a facet", () => {
  const three = [
    lecture({ directory: "a", title: "A", week: "Week 03", sequence: "a0" }),
    lecture({ directory: "b", title: "B", week: "Week 04", sequence: "a1" }),
    lecture({ directory: "c", title: "C", week: null, sequence: "a2" }),
  ];

  it("heads each value and puts the ones without a value last", () => {
    expect(shape(sidebarRows(three, "week", ""))).toEqual([
      "0:Week 03",
      "1:· A",
      "0:Week 04",
      "1:· B",
      "0:No week set",
      "1:· C",
    ]);
  });

  it("sorts headings so Week 10 follows Week 9 rather than Week 1", () => {
    // Plain string ordering puts "Week 10" before "Week 9", which reads as broken to
    // anybody with ten weeks of lectures.
    const rows = sidebarRows(
      [
        lecture({ directory: "a", week: "Week 9", sequence: "a0" }),
        lecture({ directory: "b", week: "Week 10", sequence: "a1" }),
        lecture({ directory: "c", week: "Week 2", sequence: "a2" }),
      ],
      "week",
      "",
    );

    expect(rows.filter((row) => row.kind === "group").map((row) => row.label)).toEqual([
      "Week 2",
      "Week 9",
      "Week 10",
    ]);
  });

  it("shows every lecture exactly once under a single-valued facet", () => {
    // Carried over from the test for the `grouped` helper this replaces: no lecture may be
    // dropped and none may be duplicated. Only tags are allowed to repeat a lecture.
    const many = Array.from({ length: 7 }, (_, index) =>
      lecture({
        directory: `d${String(index)}`,
        title: `L${String(index)}`,
        module: index % 3 === 0 ? "Consensus" : null,
        sequence: `a${String(index)}`,
      }),
    );
    // No second `kind` check: TypeScript infers the predicate from the filter, so the
    // rows here are already the lecture variant.
    const titles = sidebarRows(many, "module", "")
      .filter((row) => row.kind === "lecture")
      .map((row) => row.lecture.title);

    expect(titles).toHaveLength(7);
    expect(new Set(titles).size).toBe(7);
  });

  it("orders a group by sequence, not by the order the vault walk returned", () => {
    // A deliberate change from the helper this replaces, which kept input order. §3 makes
    // `sequence` the authoritative order, so the sidebar shows that order.
    const rows = sidebarRows(
      [
        lecture({ directory: "c", title: "Third", week: "Week 03", sequence: "a3" }),
        lecture({ directory: "a", title: "First", week: "Week 03", sequence: "a1" }),
        lecture({ directory: "b", title: "Second", week: "Week 03", sequence: "a2" }),
      ],
      "week",
      "",
    );

    expect(shape(rows)).toEqual([
      "0:Week 03",
      "1:· First",
      "1:· Second",
      "1:· Third",
    ]);
  });

  it("shows a lecture under every tag it carries", () => {
    // Listing it under only the first would make a tag an unreliable way to find it.
    const rows = sidebarRows(
      [lecture({ directory: "a", title: "A", tags: ["exam-2", "paper-reading"] })],
      "tag",
      "",
    );

    expect(shape(rows)).toEqual([
      "0:exam-2",
      "1:· A",
      "0:paper-reading",
      "1:· A",
    ]);
  });

  it("gives the same lecture a different key under each tag", () => {
    // Two rows for one lecture need two keys, or React reuses one element for both.
    const keys = sidebarRows(
      [lecture({ directory: "a", tags: ["one", "two"] })],
      "tag",
      "",
    )
      .filter((row) => row.kind === "lecture")
      .map((row) => row.key);

    expect(new Set(keys).size).toBe(2);
  });
});

describe("the row's own columns", () => {
  it("shows the folder's number prefix", () => {
    const rows = sidebarRows([lecture({ directory: "w3/01-raft" })], "folder", "");
    const row = rows.find((candidate) => candidate.kind === "lecture");

    expect(row?.kind === "lecture" && row.num).toBe("01");
  });

  it("shows no number for a folder without a prefix", () => {
    const rows = sidebarRows([lecture({ directory: "raft-paper" })], "folder", "");
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
      const rows = sidebarRows([lecture({ directory: "a", conversion })], "folder", "");
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
    const rows = sidebarRows(vault, "folder", "paxos");

    expect(shape(rows)).toEqual(["0:cs454", "1:· Paxos"]);
  });

  it("ignores case and matches on a facet or a path, not only the title", () => {
    expect(sidebarRows(vault, "folder", "BIO").length).toBeGreaterThan(0);
    expect(sidebarRows(vault, "folder", "bio101")).toHaveLength(2);
    expect(sidebarRows(vault, "folder", "02-paxos")).toHaveLength(2);
  });

  it("returns nothing when nothing matches, rather than everything", () => {
    expect(sidebarRows(vault, "folder", "thermodynamics")).toEqual([]);
  });

  it("treats blank typing as no search at all", () => {
    expect(sidebarRows(vault, "folder", "   ")).toHaveLength(sidebarRows(vault, "folder", "").length);
  });

  it("matches a tag, which is how a tag search is meant to work", () => {
    const tagged = [lecture({ directory: "a", tags: ["exam-2"] })];

    expect(sidebarRows(tagged, "folder", "exam")).toHaveLength(1);
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
