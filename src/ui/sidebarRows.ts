/**
 * Turning a vault into the sidebar's rows.
 *
 * The sidebar shows **one folder at a time**: the folders inside it, then the documents and
 * notes inside it. Stepping into a folder replaces the list rather than indenting it, the
 * way a Notion page or a Finder window does. Chosen with the user on 2026-11-06, replacing
 * the canvas's Folder/Week/Module/Tag grouping, which made the vault look organised only
 * once a course, module and week had been typed into every item; folders put an item where
 * it belongs by putting it there.
 *
 * Searching is the exception: it looks through the whole vault, and each row then says
 * which folder it is in, since the list no longer does.
 *
 * Pure, so the rules are tested without a DOM.
 */
import type { LectureRow } from "../ipc/vault";
import { byName, nameOf, parentOf, spoken } from "./folders";

/** The parts of a vault the sidebar lists. */
export interface Listing {
  readonly lectures: readonly LectureRow[];
  readonly folders: readonly string[];
}

/** What can be made from the sidebar, each asking for a name first. */
export type Making = "note" | "folder";

/** A folder to step into, or an item to open. One row of the sidebar's scroller. */
export type SidebarRow =
  | {
      readonly kind: "folder";
      readonly key: string;
      readonly path: string;
      readonly name: string;
      /** How many folders and items are directly inside it. */
      readonly count: number;
      /** Which folder it is in, when searching; empty otherwise. */
      readonly location: string;
    }
  | {
      readonly kind: "lecture";
      readonly key: string;
      readonly lecture: LectureRow;
      /** The item's number, or empty when it has none. */
      readonly num: string;
      /** The short note at the end of the row, or empty. */
      readonly meta: string;
      /** Which folder it is in, when searching; empty otherwise. */
      readonly location: string;
    };

/**
 * What the row's metadata column says.
 *
 * Only conversion states: the canvas shows a highlight count there, and nothing counts
 * anything yet, so rather than invent a number the column stays empty.
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
 * Whether an item matches what was typed: its own name, not the folders above it, which
 * are found as folders. Matching the whole path made a search for "week" list every item
 * in every week. Facets still count: older files hold them.
 */
function matches(lecture: LectureRow, needle: string): boolean {
  return [
    lecture.title,
    nameOf(lecture.directory),
    lecture.course ?? "",
    lecture.module ?? "",
    lecture.week ?? "",
    ...lecture.tags,
  ].some((field) => field.toLowerCase().includes(needle));
}

/** Items in `sequence` order, which §3 makes authoritative. */
function ordered(lectures: readonly LectureRow[]): LectureRow[] {
  return [...lectures].sort(
    (a, b) => a.sequence.localeCompare(b.sequence) || a.title.localeCompare(b.title),
  );
}

function folderRow(listing: Listing, path: string, searching: boolean): SidebarRow {
  const count =
    listing.folders.filter((folder) => parentOf(folder) === path).length +
    listing.lectures.filter((lecture) => parentOf(lecture.directory) === path).length;

  return {
    kind: "folder",
    key: `f:${path}`,
    path,
    name: nameOf(path),
    count,
    location: searching ? spoken(parentOf(path)) : "",
  };
}

function itemRow(lecture: LectureRow, searching: boolean): SidebarRow {
  return {
    kind: "lecture",
    key: `i:${lecture.directory}`,
    lecture,
    num: lecture.number ?? "",
    meta: metaFor(lecture),
    location: searching ? spoken(parentOf(lecture.directory)) : "",
  };
}

/**
 * The rows for `folder` (`""` is the top of the vault), or, when `query` is not blank, for
 * everything in the vault that matches it.
 *
 * Folders first, by name; then items, in their order. Empty when nothing is there or
 * nothing matches, which the component shows as a sentence rather than an empty scroller.
 */
export function sidebarRows(listing: Listing, folder: string, query: string): SidebarRow[] {
  const needle = query.trim().toLowerCase();

  if (needle !== "") {
    const folders = listing.folders
      .filter((path) => nameOf(path).toLowerCase().includes(needle))
      .sort(byName);

    return [
      ...folders.map((path) => folderRow(listing, path, true)),
      ...ordered(listing.lectures.filter((lecture) => matches(lecture, needle))).map((lecture) =>
        itemRow(lecture, true),
      ),
    ];
  }

  const folders = listing.folders.filter((path) => parentOf(path) === folder).sort(byName);
  const items = listing.lectures.filter((lecture) => parentOf(lecture.directory) === folder);

  return [
    ...folders.map((path) => folderRow(listing, path, false)),
    ...ordered(items).map((lecture) => itemRow(lecture, false)),
  ];
}

/**
 * The folder to show, given the one asked for: itself if the vault still has it, or the
 * nearest folder above it that it does.
 *
 * A folder can vanish under the sidebar — renamed in Finder, or the last view of a vault
 * that has since changed — and stepping up to what is still there beats an empty list
 * that offers no way back.
 */
export function existingFolder(listing: Listing, folder: string): string {
  let at = folder;

  while (at !== "" && !listing.folders.includes(at)) {
    at = parentOf(at);
  }

  return at;
}
