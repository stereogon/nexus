/**
 * An open item's pages (2026-11-14): the listing, which note the notes pane shows — the
 * item's own notes or one of its pages — and what each note cites.
 *
 * What each note cites is kept so the document marks a highlight as cited wherever its
 * citation lives, not only in the note on screen, and so "show in notes" can open the note
 * that cites it. It starts from disk — the listing for pages, `notes.md` for the item's
 * notes — and the editor's live report replaces a note's entry once that note has been
 * open, since what is typed is ahead of what is saved.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadNotes } from "../ipc/notes";
import { listPages, type PageSummary } from "../ipc/pages";
import { asCommandError, type CommandError } from "../ipc/vault";
import { citedIds } from "../notes/citeLinks";
import { citedAnywhere, type NoteKey } from "./pageTree";

export interface ItemPages {
  readonly pages: readonly PageSummary[];
  /** Files in `pages/` that could not be read as pages. */
  readonly unreadable: number;
  readonly failure: CommandError | null;
  /** The note the notes pane shows. */
  readonly open: NoteKey;
  readonly openNote: (note: NoteKey) => void;
  /** Reads the listing again, after a page is made or deleted. */
  readonly refresh: () => Promise<void>;
  /** What each note is known to cite. */
  readonly cites: ReadonlyMap<NoteKey, ReadonlySet<string>>;
  /** Every highlight cited in any of the item's notes. */
  readonly cited: ReadonlySet<string>;
  /** The editor's report of what the open note cites now. */
  readonly noteCited: (note: NoteKey, ids: ReadonlySet<string>) => void;
}

export function useItemPages(vault: string, directory: string): ItemPages {
  const [pages, setPages] = useState<readonly PageSummary[]>([]);
  const [unreadable, setUnreadable] = useState(0);
  const [failure, setFailure] = useState<CommandError | null>(null);
  const [open, setOpen] = useState<NoteKey>(null);
  const [fromDisk, setFromDisk] = useState<ReadonlyMap<NoteKey, ReadonlySet<string>>>(new Map());
  const [live, setLive] = useState<ReadonlyMap<NoteKey, ReadonlySet<string>>>(new Map());
  // Which item the latest listing was asked for, so one for an item left is dropped.
  const asked = useRef(directory);

  const refresh = useCallback(async () => {
    const item = directory;

    try {
      const listing = await listPages(vault, item);

      if (asked.current === item) {
        setPages(listing.pages);
        setUnreadable(listing.unreadable);
        setFailure(null);
        setFromDisk((known) => new Map([...known].filter(([note]) => note === null).concat(listing.pages.map((page) => [page.id, new Set(page.cites)]))));
      }
    } catch (thrown: unknown) {
      if (asked.current === item) {
        setFailure(asCommandError(thrown));
      }
    }
  }, [vault, directory]);

  useEffect(() => {
    asked.current = directory;
    setPages([]);
    setUnreadable(0);
    setFailure(null);
    setOpen(null);
    setFromDisk(new Map());
    setLive(new Map());
    void refresh();

    // The item's own notes, for what they cite while a page is open instead. Notes that
    // cannot be read are reported where they are shown — the notes pane opens them first,
    // with the error and its remediation — so here they simply add nothing known.
    loadNotes(vault, directory).then(
      (notes) => {
        if (asked.current === directory) {
          setFromDisk((known) => new Map([...known, [null, new Set(citedIds(notes.text))]]));
        }
      },
      () => undefined,
    );
  }, [vault, directory, refresh]);

  const noteCited = useCallback((note: NoteKey, ids: ReadonlySet<string>) => {
    setLive((known) => (known.get(note) === ids ? known : new Map([...known, [note, ids]])));
  }, []);

  // Rebuilt only when a note's entry changes, so typing an ordinary sentence does not
  // re-render every page of the document.
  const cites = useMemo(() => new Map([...fromDisk, ...live]), [fromDisk, live]);
  const cited = useMemo(() => citedAnywhere(cites), [cites]);

  return { pages, unreadable, failure, open, openNote: setOpen, refresh, cites, cited, noteCited };
}
