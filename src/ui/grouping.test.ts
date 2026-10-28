/**
 * The grouping rule the sidebar runs on.
 *
 * §3: "The sidebar groups on facets at runtime, so one physical layout serves many logical
 * views." This is that grouping, and it is tested here rather than through a rendered
 * component because it is a pure function over rows -- the part that can be wrong in a way
 * no screenshot would show.
 */
import { describe, expect, it } from "vitest";

import type { LectureRow } from "../ipc/vault";
import { grouped } from "./LectureList";

function lecture(
  directory: string,
  facets: Partial<LectureRow> = {},
): LectureRow {
  return {
    directory,
    title: directory,
    sequence: "a0",
    course: null,
    module: null,
    week: null,
    tags: [],
    conversion: "notRequired",
    documentReady: true,
    ...facets,
  };
}

describe("grouped", () => {
  it("leaves the list alone when nothing is grouped on", () => {
    const lectures = [lecture("raft"), lecture("paxos")];

    expect(grouped(lectures, "none")).toEqual([["", lectures]]);
  });

  it("gathers lectures under the facet they share", () => {
    const groups = grouped(
      [
        lecture("raft", { week: "Week 3" }),
        lecture("paxos", { week: "Week 3" }),
        lecture("intro", { week: "Week 1" }),
      ],
      "week",
    );

    expect(groups.map(([name, rows]) => [name, rows.length])).toEqual([
      ["Week 1", 1],
      ["Week 3", 2],
    ]);
  });

  it("puts the unfiled pile last however the groups are named", () => {
    // It is the work to be done, and sorting it among the real groups -- "Unfiled" falls
    // between "CS454" and "Week 1" alphabetically -- would bury it.
    const groups = grouped(
      [
        lecture("stray"),
        lecture("raft", { course: "Week 1 Systems" }),
        lecture("intro", { course: "CS454" }),
      ],
      "course",
    );

    expect(groups.map(([name]) => name)).toEqual([
      "CS454",
      "Week 1 Systems",
      "Unfiled",
    ]);
  });

  it("keeps every lecture, in one group each", () => {
    const lectures = [
      lecture("raft", { module: "Consensus" }),
      lecture("paxos", { module: "Consensus" }),
      lecture("intro"),
      lecture("crdt", { module: "Replication" }),
    ];

    const landed = grouped(lectures, "module").flatMap(([, rows]) => rows);

    expect(landed).toHaveLength(lectures.length);
    expect(new Set(landed.map((row) => row.directory)).size).toBe(
      lectures.length,
    );
  });

  it("holds the order lectures arrived in within a group", () => {
    // `sequence` is authoritative and the scan already returns rows in it, so grouping must
    // not reorder what it is handed.
    const groups = grouped(
      [
        lecture("first", { week: "Week 1" }),
        lecture("second", { week: "Week 1" }),
        lecture("third", { week: "Week 1" }),
      ],
      "week",
    );

    expect(groups[0]?.[1].map((row) => row.directory)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});
