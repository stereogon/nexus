import { describe, expect, it } from "vitest";

import type { ConversionState, LectureRow } from "../ipc/vault";
import { secondaryFacets, sidebarRows, type SidebarRow } from "./sidebarRows";

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

describe("grouping by a facet", () => {
  const three = [
    lecture({ directory: "a", title: "A", week: "Week 03", sequence: "a0" }),
    lecture({ directory: "b", title: "B", week: "Week 04", sequence: "a1" }),
    lecture({ directory: "c", title: "C", week: null, sequence: "a2" }),
  ];

  it("heads each value and puts the ones without a value last", () => {
    expect(shape(sidebarRows(three, "week", "none", ""))).toEqual([
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
    const rows = sidebarRows([
        lecture({ directory: "a", week: "Week 9", sequence: "a0" }),
        lecture({ directory: "b", week: "Week 10", sequence: "a1" }),
        lecture({ directory: "c", week: "Week 2", sequence: "a2" }),
      ],
      "week",
      "none",
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
    const titles = sidebarRows(many, "module", "none", "")
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
      "none",
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
      "none",
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
      "none",
      "",
    )
      .filter((row) => row.kind === "lecture")
      .map((row) => row.key);

    expect(new Set(keys).size).toBe(2);
  });
});

describe("grouping on two axes at once", () => {
  // Raised by the user on 2026-10-29: grouping by module alone puts every lecture of that
  // module in one flat pile, which on a real course is thirty rows with no structure.
  // Teaching material is organised by module *and* week.
  const course = [
    lecture({ directory: "a", title: "Raft", module: "Consensus", week: "Week 03", sequence: "a0" }),
    lecture({ directory: "b", title: "Paxos", module: "Consensus", week: "Week 03", sequence: "a1" }),
    lecture({ directory: "c", title: "Election", module: "Consensus", week: "Week 04", sequence: "a2" }),
    lecture({ directory: "d", title: "Clocks", module: "Ordering", week: "Week 03", sequence: "a3" }),
  ];

  it("nests weeks inside modules", () => {
    expect(shape(sidebarRows(course, "module", "week", ""))).toEqual([
      "0:Consensus",
      "1:Week 03",
      "2:· Raft",
      "2:· Paxos",
      "1:Week 04",
      "2:· Election",
      "0:Ordering",
      "1:Week 03",
      "2:· Clocks",
    ]);
  });

  it("nests the other way round just as well", () => {
    expect(shape(sidebarRows(course, "week", "module", ""))).toEqual([
      "0:Week 03",
      "1:Consensus",
      "2:· Raft",
      "2:· Paxos",
      "1:Ordering",
      "2:· Clocks",
      "0:Week 04",
      "1:Consensus",
      "2:· Election",
    ]);
  });

  it("stays flat when no second level is asked for", () => {
    expect(shape(sidebarRows(course, "module", "none", ""))).toEqual([
      "0:Consensus",
      "1:· Raft",
      "1:· Paxos",
      "1:· Election",
      "0:Ordering",
      "1:· Clocks",
    ]);
  });

  it("ignores a second level that repeats the first", () => {
    // Module then module would draw every heading twice and tell nobody anything.
    expect(shape(sidebarRows(course, "module", "module", ""))).toEqual(
      shape(sidebarRows(course, "module", "none", "")),
    );
  });

  it("leaves folder grouping alone, since it already nests", () => {
    const nested = [lecture({ directory: "CS454/Week 03/01-raft", title: "Raft" })];

    expect(shape(sidebarRows(nested, "folder", "week", ""))).toEqual(
      shape(sidebarRows(nested, "folder", "none", "")),
    );
  });

  it("keeps the lectures with no value for the inner facet, at the end of their group", () => {
    const mixed = [
      lecture({ directory: "a", title: "Dated", module: "Consensus", week: "Week 03" }),
      lecture({ directory: "b", title: "Undated", module: "Consensus", week: null, sequence: "a1" }),
    ];

    expect(shape(sidebarRows(mixed, "module", "week", ""))).toEqual([
      "0:Consensus",
      "1:Week 03",
      "2:· Dated",
      "1:No week set",
      "2:· Undated",
    ]);
  });

  it("gives each nested row a key unique across the whole tree", () => {
    // Two levels multiply the chances of a collision: the same lecture can appear under
    // two tags, each inside a different week.
    const tagged = [
      lecture({ directory: "a", tags: ["exam", "paper"], week: "Week 03" }),
      lecture({ directory: "b", tags: ["exam"], week: "Week 03", sequence: "a1" }),
    ];
    const keys = sidebarRows(tagged, "tag", "week", "").map((row) => row.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("searches before grouping, so empty branches do not survive", () => {
    expect(shape(sidebarRows(course, "module", "week", "clocks"))).toEqual([
      "0:Ordering",
      "1:Week 03",
      "2:· Clocks",
    ]);
  });
});

describe("which second levels are offered", () => {
  it("offers the facets other than the one already in use", () => {
    expect(secondaryFacets("module")).toEqual(["week", "tag"]);
    expect(secondaryFacets("week")).toEqual(["module", "tag"]);
    expect(secondaryFacets("tag")).toEqual(["week", "module"]);
  });

  it("offers none for folder, which nests as deeply as the directories do", () => {
    expect(secondaryFacets("folder")).toEqual([]);
  });
});
