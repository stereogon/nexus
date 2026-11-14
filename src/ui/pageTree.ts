/**
 * Reading an item's pages as the tree they make (2026-11-14): each page names its parent,
 * and `null` is the item's own notes. Pure, so the window's questions — where is this page,
 * what is inside this note, how many go with a delete — are tested without one.
 *
 * The app never makes a cycle, since a page is given its parent once and never moved; a
 * hand-edited file could, so every walk here visits a page at most once and always ends.
 */
import type { PageSummary } from "../ipc/pages";

/** A note in an item: its own notes (`null`) or one of its pages. */
export type NoteKey = string | null;

/** The pages from the top down to `id`, `id` last; empty if there is no such page. */
export function pathTo(pages: readonly PageSummary[], id: string): PageSummary[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const path: PageSummary[] = [];
  const seen = new Set<string>();

  for (let at = byId.get(id); at !== undefined && !seen.has(at.id); at = at.parent === null ? undefined : byId.get(at.parent)) {
    seen.add(at.id);
    path.unshift(at);
  }

  return path;
}

/** The pages directly inside `note`, in the order they were made. */
export function pagesIn(pages: readonly PageSummary[], note: NoteKey): PageSummary[] {
  return pages.filter((page) => page.parent === note);
}

/** How many pages are inside `id` at any depth, not counting `id`. */
export function pagesInside(pages: readonly PageSummary[], id: string): number {
  const seen = new Set([id]);
  const queue = [id];

  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    for (const page of pages) {
      if (page.parent === at && !seen.has(page.id)) {
        seen.add(page.id);
        queue.push(page.id);
      }
    }
  }

  return seen.size - 1;
}

/**
 * Which note cites `id`: the one open first, then the others in the order `cites` holds them.
 * `undefined` when none does (`null` is the item's own notes). `cites` holds what each note
 * is known to cite.
 */
export function noteCiting(cites: ReadonlyMap<NoteKey, ReadonlySet<string>>, id: string, open: NoteKey): NoteKey | undefined {
  if (cites.get(open)?.has(id) === true) {
    return open;
  }

  for (const [note, cited] of cites) {
    if (cited.has(id)) {
      return note;
    }
  }

  return undefined;
}

/** Every highlight cited anywhere in the item: the union of what each note cites. */
export function citedAnywhere(cites: ReadonlyMap<NoteKey, ReadonlySet<string>>): Set<string> {
  return new Set([...cites.values()].flatMap((cited) => [...cited]));
}
