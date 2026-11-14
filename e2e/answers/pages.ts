/**
 * The harness's answers about pages, notes inside an item's notes (2026-11-14), and the
 * pages a vault search finds. Kept in memory for the page's life, from the fixture's seeded
 * pages, with the save rule of `notes.ts`: a save based on anything but the current version
 * writes nothing and answers with what is there.
 *
 * Ids and dates are made up in order. The page file format, its parsing and the move to
 * `.trash` are Rust's, tested there against real temporary vaults.
 */
import { z } from "zod";

import { citedIds } from "../../src/notes/citeLinks";
import type { Fixture, SeededPage } from "../fixture";
import { CommandFailure, InLecture, type Handlers } from "./shared";

interface HeldPage extends Omit<SeededPage, "text"> {
  readonly created: string;
  text: string;
  version: string;
}

/** Every item's pages, keyed by directory. */
export type PageShelf = Map<string, HeldPage[]>;

const OnePage = InLecture.extend({ page: z.string() });

export function pageShelf(fixture: Fixture): PageShelf {
  return new Map(
    Object.entries(fixture.itemPages ?? {}).map(([directory, pages]) => [
      directory,
      pages.map((page) => ({ ...page, created: "2026-11-14T09:00:00Z", version: "seeded" })),
    ]),
  );
}

export function pagesHandlers(shelf: PageShelf): Handlers {
  let made = 0;
  let revisions = 0;
  const pagesOf = (directory: string) => shelf.get(directory) ?? [];
  const find = (directory: string, id: string) => {
    const page = pagesOf(directory).find((held) => held.id === id);

    if (page === undefined) {
      throw new CommandFailure("ERR_PAGE_NOT_FOUND", "That page is no longer here. It may have been deleted.");
    }

    return page;
  };
  const summary = ({ id, title, parent, created, text }: HeldPage) => ({ id, title, parent, created, cites: citedIds(text) });

  return {
    list_pages: (args) => ({ pages: pagesOf(InLecture.parse(args).directory).map(summary), unreadable: 0 }),
    create_page: (args) => {
      const { directory, title, parent } = InLecture.extend({ title: z.string(), parent: z.string().nullable() }).parse(args);

      made += 1;
      const page: HeldPage = { id: `pg-e2e${String(made)}`, title: title.trim(), parent, text: "", created: "2026-11-14T10:00:00Z", version: "empty" };

      shelf.set(directory, [...pagesOf(directory), page]);
      return summary(page);
    },
    load_page: (args) => {
      const { directory, page } = OnePage.parse(args);
      const { text, version } = find(directory, page);

      return { text, version };
    },
    save_page: (args) => {
      const { directory, page, text, basedOn } = OnePage.extend({ text: z.string(), basedOn: z.string() }).parse(args);
      const held = find(directory, page);

      if (held.version !== basedOn) {
        return { outcome: "conflict", onDisk: { text: held.text, version: held.version } };
      }

      revisions += 1;
      held.text = text;
      held.version = `p${String(revisions)}`;
      return { outcome: "saved", version: held.version };
    },
    // The page and every page inside it, as the real command answers.
    delete_page: (args) => {
      const { directory, page } = OnePage.parse(args);
      const gone = new Set([find(directory, page).id]);

      for (let grew = true; grew; ) {
        grew = false;
        for (const held of pagesOf(directory)) {
          if (held.parent !== null && gone.has(held.parent) && !gone.has(held.id)) {
            gone.add(held.id);
            grew = true;
          }
        }
      }

      shelf.set(directory, pagesOf(directory).filter((held) => !gone.has(held.id)));
      return [...gone];
    },
  };
}
