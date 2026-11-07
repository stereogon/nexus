import { describe, expect, it } from "vitest";

import type { ConversionState, LectureRow } from "../ipc/vault";
import { existingFolder, sidebarRows, type Listing, type SidebarRow } from "./sidebarRows";

function lecture(over: Partial<LectureRow> & { directory: string }): LectureRow {
  return {
    kind: "document",
    title: "Raft Consensus",
    number: null,
    numberInTitle: null,
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

/** The list as the eye reads it: `▸ name` for a folder, `· title` for an item. */
function shape(rows: readonly SidebarRow[]): string[] {
  return rows.map((row) => (row.kind === "folder" ? `▸ ${row.name}` : `· ${row.lecture.title}`));
}

const VAULT: Listing = {
  folders: ["CS454", "CS454/Week 10", "CS454/Week 9", "Reading"],
  lectures: [
    lecture({ directory: "CS454/Week 9/raft", title: "Raft", sequence: "a1" }),
    lecture({ directory: "CS454/Week 9/elect", title: "Election", sequence: "a0" }),
    lecture({ directory: "CS454/overview", title: "Overview", sequence: "a2" }),
    lecture({ directory: "plans", title: "Plans", kind: "note", sequence: "a3" }),
  ],
};

describe("one folder at a time", () => {
  it("lists the folders inside it, then the items inside it, and nothing deeper", () => {
    expect(shape(sidebarRows(VAULT, "", ""))).toEqual(["▸ CS454", "▸ Reading", "· Plans"]);
    expect(shape(sidebarRows(VAULT, "CS454", ""))).toEqual(["▸ Week 9", "▸ Week 10", "· Overview"]);
  });

  it("orders items by sequence, which is authoritative, not by name", () => {
    expect(shape(sidebarRows(VAULT, "CS454/Week 9", ""))).toEqual(["· Election", "· Raft"]);
  });

  it("orders folders by name with numbers read as numbers", () => {
    // "Week 10" after "Week 9", or ten weeks of folders reads as broken.
    const names = sidebarRows(VAULT, "CS454", "").flatMap((row) => (row.kind === "folder" ? [row.name] : []));

    expect(names).toEqual(["Week 9", "Week 10"]);
  });

  it("counts what is directly inside a folder", () => {
    const cs454 = sidebarRows(VAULT, "", "").find((row) => row.kind === "folder" && row.name === "CS454");

    expect(cs454?.kind === "folder" && cs454.count).toBe(3);
  });

  it("shows an empty folder as empty, not as missing", () => {
    expect(sidebarRows(VAULT, "Reading", "")).toEqual([]);
  });

  it("gives a row no location while browsing, since the list says where it is", () => {
    expect(sidebarRows(VAULT, "CS454", "").every((row) => row.location === "")).toBe(true);
  });
});

describe("the row's own columns", () => {
  it("shows the item's number, and none read off its folder's name", () => {
    const rows = sidebarRows(
      { folders: [], lectures: [lecture({ directory: "01-raft", number: "3a" }), lecture({ directory: "02-x", sequence: "a1" })] },
      "",
      "",
    );

    expect(rows.map((row) => row.kind === "lecture" && row.num)).toEqual(["3a", ""]);
  });

  it("says what a document is waiting for, and nothing when it is ready", () => {
    const states: readonly (readonly [ConversionState, string])[] = [
      ["converting", "Converting"],
      ["queued", "Queued"],
      ["failed", "Failed"],
      ["ready", ""],
      ["notRequired", ""],
    ];

    for (const [conversion, expected] of states) {
      const [row] = sidebarRows({ folders: [], lectures: [lecture({ directory: "a", conversion })] }, "", "");

      expect(row?.kind === "lecture" && row.meta).toBe(expected);
    }
  });
});

describe("searching", () => {
  it("looks through the whole vault, whatever folder is showing", () => {
    expect(shape(sidebarRows(VAULT, "Reading", "raft"))).toEqual(["· Raft"]);
  });

  it("finds folders by name as well as items", () => {
    expect(shape(sidebarRows(VAULT, "", "week"))).toEqual(["▸ Week 9", "▸ Week 10"]);
  });

  it("says where each result is, since the list no longer does", () => {
    const [row] = sidebarRows(VAULT, "", "election");

    expect(row?.location).toBe("CS454 / Week 9");
  });

  it("ignores case and matches a tag or an older file's facets", () => {
    const tagged: Listing = {
      folders: [],
      lectures: [lecture({ directory: "a", tags: ["exam-2"] }), lecture({ directory: "b", course: "BIO101" })],
    };

    expect(sidebarRows(tagged, "", "EXAM")).toHaveLength(1);
    expect(sidebarRows(tagged, "", "bio101")).toHaveLength(1);
  });

  it("returns nothing when nothing matches, and treats blank typing as no search", () => {
    expect(sidebarRows(VAULT, "", "thermodynamics")).toEqual([]);
    expect(sidebarRows(VAULT, "", "   ")).toEqual(sidebarRows(VAULT, "", ""));
  });
});

describe("a folder that has gone", () => {
  it("steps up to the nearest folder the vault still has", () => {
    expect(existingFolder(VAULT, "CS454/Week 9")).toBe("CS454/Week 9");
    expect(existingFolder(VAULT, "CS454/Renamed/Deeper")).toBe("CS454");
    expect(existingFolder(VAULT, "Gone")).toBe("");
  });
});
