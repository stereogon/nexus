/**
 * What the ⌘P search window lists, as one flat list in reading order.
 *
 * Names first — documents, notes and folders anywhere in the vault whose names match,
 * each saying where it is — then lines of notes and pages, then highlights, each opening
 * at its place. A page (2026-11-14) says which note it lives in, and opens beside its
 * item's document. One list rather than separate boxes, so ↑ and ↓ move through all of it and Enter
 * opens whichever is chosen (redesign canvas, 2026-11-07). Pure, so the order is tested
 * without a window.
 */
import type { Snippet, VaultSearch } from "../ipc/search";
import type { LectureRow } from "../ipc/vault";
import type { HighlightSemantic } from "../ipc/annotations";
import { parentOf, spoken } from "./folders";
import { sidebarRows, type Listing } from "./sidebarRows";
import type { ArrivalTarget } from "./useArrival";

/** Which group a result belongs to, in the order they are shown. */
export type ResultGroup = "names" | "notes" | "highlights";

export const GROUP_TITLE: Record<ResultGroup, string> = {
  names: "Documents, notes and folders",
  notes: "In notes",
  highlights: "In highlights",
};

/** What choosing a result does. */
export type ResultTarget =
  | { readonly kind: "folder"; readonly path: string }
  | { readonly kind: "item"; readonly lecture: LectureRow }
  | { readonly kind: "place"; readonly lecture: LectureRow; readonly at: ArrivalTarget };

export interface SearchResult {
  readonly key: string;
  readonly group: ResultGroup;
  /** What it is: a name, or the item a line or highlight is in. */
  readonly title: string;
  /** Which line or page, for a place inside an item; empty for a name. */
  readonly detail: string;
  /** The words around the match, for a line or highlight. */
  readonly snippet: Snippet | null;
  /** Its folder, as `CS454 / Week 3`; empty at the top of the vault. */
  readonly where: string;
  /** What the icon shows. */
  readonly look: "folder" | "document" | "note" | "page" | HighlightSemantic | "sticky";
  readonly target: ResultTarget;
}

export function searchResults(listing: Listing, query: string, found: VaultSearch | null): SearchResult[] {
  const names: SearchResult[] = sidebarRows(listing, "", query).map((row) =>
    row.kind === "folder"
      ? {
          key: `f:${row.path}`,
          group: "names",
          title: row.name,
          detail: "",
          snippet: null,
          where: row.location,
          look: "folder",
          target: { kind: "folder", path: row.path },
        }
      : {
          key: `i:${row.lecture.directory}`,
          group: "names",
          title: row.lecture.title,
          detail: "",
          snippet: null,
          where: row.location,
          look: row.lecture.kind,
          target: { kind: "item", lecture: row.lecture },
        },
  );

  if (found === null) {
    return names;
  }

  const byDirectory = new Map(listing.lectures.map((lecture) => [lecture.directory, lecture]));
  const notes: SearchResult[] = [];
  const highlights: SearchResult[] = [];

  for (const hits of found.lectures) {
    const lecture = byDirectory.get(hits.directory);

    // An item removed since the search was asked: its results lead nowhere.
    if (lecture === undefined) {
      continue;
    }

    const where = spoken(parentOf(lecture.directory));

    for (const hit of hits.notes) {
      notes.push({
        key: `l:${lecture.directory}:${String(hit.line)}`,
        group: "notes",
        title: lecture.title,
        detail: `line ${String(hit.line)}`,
        snippet: hit.snippet,
        where,
        look: lecture.kind,
        target: { kind: "place", lecture, at: { kind: "line", line: hit.line } },
      });
    }

    for (const hit of hits.pages) {
      const [first] = hit.notes;

      notes.push({
        key: `p:${lecture.directory}:${hit.id}`,
        group: "notes",
        title: hit.title,
        detail: `page in ${hit.parentTitle ?? lecture.title}`,
        snippet: first?.snippet ?? hit.titleMatch,
        where,
        look: "page",
        target: { kind: "place", lecture, at: { kind: "page", page: hit.id, line: first?.line ?? null } },
      });
    }

    for (const hit of hits.marks) {
      highlights.push({
        key: `m:${lecture.directory}:${hit.id}`,
        group: "highlights",
        title: lecture.title,
        detail: `page ${String(hit.page)}`,
        snippet: hit.snippet,
        where,
        look: hit.semantic ?? "sticky",
        target: { kind: "place", lecture, at: { kind: "highlight", id: hit.id } },
      });
    }
  }

  return [...names, ...notes, ...highlights];
}
