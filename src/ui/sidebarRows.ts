/**
 * Turning a vault into the sidebar's rows.
 *
 * The design canvas's sidebar is one flat scroller of rows at different indents, not a
 * list of cards: a group heading, then its lectures, each row carrying a number, a title
 * and a short piece of metadata. This module produces exactly that list, so the component
 * that draws it holds no decisions and this part can be tested without a DOM.
 *
 * The four groupings are the canvas's — Folder, Week, Module, Tag — which is not what the
 * first pass at the UI offered (Nothing, Course, Module, Week). §3 makes the canvas
 * authoritative, so these are its four.
 */
import type { LectureRow } from "../ipc/vault";

/** A facet lectures can be gathered under. */
export type Facet = "week" | "module" | "tag";

/** The four groupings the canvas's segmented control offers. */
export type GroupBy = "folder" | Facet;

/**
 * A second facet to divide each group by, or `none`.
 *
 * **Not on the canvas, and the canvas is wrong here.** Its segmented control picks exactly
 * one grouping, which means asking for lectures by module gets every lecture of that
 * module in one flat pile — on a real course that is thirty rows with no structure, and
 * the grouping has bought nothing. Teaching material is organised on two axes at once:
 * module *and* week. Raised by the user on 2026-10-29; §1.7 says a design that is wrong is
 * to be argued with rather than implemented faithfully.
 *
 * Two levels, not arbitrarily many: two covers module-by-week and tag-by-week, and a tree
 * deep enough to need scrolling to find a heading is its own problem. `Folder` already
 * nests as deeply as the directories do, so it takes no second level.
 */
export type ThenBy = Facet | "none";

export const GROUPINGS: readonly (readonly [GroupBy, string])[] = [
  ["folder", "Folder"],
  ["week", "Week"],
  ["module", "Module"],
  ["tag", "Tag"],
];

/** The grouping a stored or typed value names, falling back to the canvas's default. */
export function groupingFrom(value: string): GroupBy {
  return GROUPINGS.find(([name]) => name === value)?.[0] ?? "folder";
}

/** A heading, or a lecture. One row of the sidebar's scroller. */
export type SidebarRow =
  | {
      readonly kind: "group";
      /** Unique within the list, so React has a stable key. */
      readonly key: string;
      readonly label: string;
      readonly depth: number;
    }
  | {
      readonly kind: "lecture";
      readonly key: string;
      readonly lecture: LectureRow;
      readonly depth: number;
      /** The folder's number prefix, or empty when it has none. */
      readonly num: string;
      /** The short note at the end of the row, or empty. */
      readonly meta: string;
    };

/** Where a lecture with no value for the facet being grouped on is put. */
const WITHOUT: Record<Facet, string> = {
  week: "No week set",
  module: "Unfiled",
  tag: "Untagged",
};

/** The values a lecture has for a facet. Empty means it has none. */
function valuesOf(lecture: LectureRow, facet: Facet): readonly string[] {
  switch (facet) {
    case "week":
      return lecture.week === null ? [] : [lecture.week];
    case "module":
      return lecture.module === null ? [] : [lecture.module];
    case "tag":
      return lecture.tags;
  }
}

/** The facets offered as a second level, given the first. */
export function secondaryFacets(by: GroupBy): readonly Facet[] {
  return by === "folder" ? [] : (["week", "module", "tag"] as const).filter((f) => f !== by);
}

/**
 * What the row's metadata column says.
 *
 * Only conversion states for now. The canvas shows a count there for a lecture with
 * annotations (`12`, `4`), and nothing counts anything yet — so rather than invent a
 * number, the column stays empty until there is something true to put in it.
 */
function metaFor(lecture: LectureRow): string {
  switch (lecture.conversion) {
    case "converting":
      return "Converting";
    case "queued":
      return "Queued";
    case "failed":
      return "Failed";
    case "notRequired":
    case "ready":
      return "";
  }
}

/**
 * The number prefix on a lecture's own folder, if it has one.
 *
 * Read from the folder name rather than from `sequence`, because that prefix is what the
 * person sees in Finder and the canvas shows the same two digits. §3: `sequence` is
 * authoritative for *order*, and the prefix is a derived projection of it — so this is
 * displaying the projection, not deciding anything from it.
 */
function numberPrefix(directory: string): string {
  const own = directory.split("/").at(-1) ?? "";
  const digits = /^(\d+)[-_ ]/u.exec(own);

  return digits?.[1] ?? "";
}

/** The folders above a lecture, which become its nested headings. */
function ancestors(directory: string): readonly string[] {
  return directory.split("/").slice(0, -1).filter((part) => part !== "");
}

/** Whether a lecture matches what was typed in the search box. */
function matches(lecture: LectureRow, query: string): boolean {
  if (query === "") {
    return true;
  }

  const needle = query.toLowerCase();
  const haystack = [
    lecture.title,
    lecture.directory,
    lecture.course ?? "",
    lecture.module ?? "",
    lecture.week ?? "",
    ...lecture.tags,
  ];

  return haystack.some((field) => field.toLowerCase().includes(needle));
}

/** Lectures in `sequence` order, which §3 makes authoritative. */
function ordered(lectures: readonly LectureRow[]): LectureRow[] {
  return [...lectures].sort(
    (a, b) => a.sequence.localeCompare(b.sequence) || a.title.localeCompare(b.title),
  );
}

/**
 * Groups by one facet, then by the next, nesting a heading per level.
 *
 * Recursive rather than two hard-coded levels, because the shape is the same at every
 * depth and writing it twice is how the two copies drift apart. The UI offers two levels;
 * nothing here depends on that.
 */
function byFacets(
  lectures: readonly LectureRow[],
  levels: readonly Facet[],
  depth: number,
  path: string,
): SidebarRow[] {
  const [facet, ...rest] = levels;

  if (facet === undefined) {
    return ordered(lectures).map((lecture) => lectureRow(lecture, depth, path));
  }

  const without = WITHOUT[facet];
  const groups = new Map<string, LectureRow[]>();

  for (const lecture of lectures) {
    const values = valuesOf(lecture, facet);

    // A lecture with no value still appears, under `without`. A lecture with several --
    // only tags can have several -- appears under each, because hiding it from all but the
    // first would make a tag an unreliable way to find anything.
    for (const value of values.length === 0 ? [without] : values) {
      const held = groups.get(value);

      if (held === undefined) {
        groups.set(value, [lecture]);
      } else {
        held.push(lecture);
      }
    }
  }

  const names = [...groups.keys()].sort((left, right) => {
    if (left === without) {
      return 1;
    }

    if (right === without) {
      return -1;
    }

    // Numeric, or "Week 10" sorts before "Week 9" and reads as broken to anyone with ten
    // weeks of lectures.
    return left.localeCompare(right, undefined, { numeric: true });
  });

  return names.flatMap((name) => {
    const within = `${path}/${name}`;

    return [
      { kind: "group" as const, key: `g:${within}`, label: name, depth },
      ...byFacets(groups.get(name) ?? [], rest, depth + 1, within),
    ];
  });
}

function lectureRow(lecture: LectureRow, depth: number, within: string): SidebarRow {
  return {
    kind: "lecture",
    // The directory alone is not unique in a tag listing, where one lecture can appear
    // under several headings.
    key: `${within}/${lecture.directory}`,
    lecture,
    depth,
    num: numberPrefix(lecture.directory),
    meta: metaFor(lecture),
  };
}

/** Groups by where the lectures actually live, nesting one heading per folder. */
function byFolder(lectures: readonly LectureRow[]): SidebarRow[] {
  const rows: SidebarRow[] = [];
  let open: readonly string[] = [];

  for (const lecture of ordered(lectures)) {
    const path = ancestors(lecture.directory);

    // Headings are emitted only where this lecture's path diverges from the last one's, so
    // a run of lectures in one folder sits under a single heading.
    let shared = 0;

    while (shared < open.length && shared < path.length && open[shared] === path[shared]) {
      shared += 1;
    }

    for (let depth = shared; depth < path.length; depth += 1) {
      rows.push({
        kind: "group",
        key: `g:${path.slice(0, depth + 1).join("/")}`,
        label: path[depth] ?? "",
        depth,
      });
    }

    open = path;
    rows.push(lectureRow(lecture, path.length, "folder"));
  }

  return rows;
}

/**
 * Builds the sidebar's rows.
 *
 * Returns an empty list when nothing matches, which the component shows as a message
 * rather than as an empty scroller.
 */
export function sidebarRows(
  lectures: readonly LectureRow[],
  by: GroupBy,
  thenBy: ThenBy,
  query: string,
): SidebarRow[] {
  const found = lectures.filter((lecture) => matches(lecture, query.trim()));

  if (by === "folder") {
    return byFolder(found);
  }

  // A second level only where it says something: asking for module then module would draw
  // every heading twice.
  const levels = thenBy === "none" || thenBy === by ? [by] : [by, thenBy];

  return byFacets(found, levels, 0, "");
}
