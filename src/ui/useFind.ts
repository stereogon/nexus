/**
 * Find in the open document (⌘F): the query, every match across its pages, and which one
 * is current.
 *
 * Pages are drawn only near the screen, so their text layers cannot be searched; each
 * page's text is read from the PDF instead, once, and kept for the life of the document.
 * A search waits for typing to pause and abandons itself if the query changes meanwhile,
 * as the vault search does.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { findOnPage, startingMatch, steppedMatch, type FindMatch } from "../pdf/find";
import type { PageSource } from "../pdf/useDocument";
import { useMetaShortcut } from "./useMetaShortcut";

const FIND_PAUSE_MS = 150;

export interface Find {
  readonly open: boolean;
  /** Changes each time ⌘F is pressed, so the field takes focus again. */
  readonly focusKey: number;
  readonly query: string;
  readonly setQuery: (query: string) => void;
  /** Every match, in page order; empty while searching or with nothing found. */
  readonly matches: readonly FindMatch[];
  readonly current: number | null;
  /** Whether the pages are still being read for the latest query. */
  readonly searching: boolean;
  /** Whether a page's text could not be read, so the search did not finish. */
  readonly failed: boolean;
  readonly step: (direction: 1 | -1) => void;
  readonly close: () => void;
  /** Whether the current match still has to be scrolled into view. */
  readonly reveal: boolean;
  /** Called once it has been, so scrolling back to its page later does not snap to it. */
  readonly revealed: () => void;
}

export function useFind(source: PageSource | null, pageCount: number, showing: number): Find {
  const [open, setOpen] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<readonly FindMatch[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reveal, setReveal] = useState(false);
  const texts = useRef(new Map<number, string>());
  // Read when a search finishes, to start on the page being read then, without re-running
  // the search every time the reader scrolls.
  const reading = useRef(showing);

  useEffect(() => {
    reading.current = showing;
  }, [showing]);

  // A new document has new text.
  useEffect(() => {
    texts.current = new Map();
  }, [source]);

  useEffect(() => {
    const asked = query.trim();

    if (!open || source === null || asked === "") {
      setMatches([]);
      setCurrent(null);
      setSearching(false);
      setFailed(false);
      return undefined;
    }

    const session = { current: true };
    const live = () => session.current;

    setSearching(true);
    setFailed(false);

    const timer = window.setTimeout(() => {
      void (async () => {
        const found: FindMatch[] = [];

        for (let index = 0; index < pageCount; index += 1) {
          const cached = texts.current.get(index);
          const text = cached ?? (await (await source(index)).text());

          if (!live()) {
            return;
          }

          texts.current.set(index, text);
          found.push(...findOnPage(text, asked, index));
        }

        setMatches(found);
        setCurrent(startingMatch(found, reading.current));
        setReveal(true);
        setSearching(false);
      })().catch(() => {
        // A page whose text cannot be read leaves the search unfinished, and the bar says
        // so — "No matches" would claim a search that did not run to the end.
        if (live()) {
          setMatches([]);
          setCurrent(null);
          setSearching(false);
          setFailed(true);
        }
      });
    }, FIND_PAUSE_MS);

    return () => {
      session.current = false;
      window.clearTimeout(timer);
    };
  }, [open, query, source, pageCount]);

  const show = useCallback(() => {
    setOpen(true);
    setFocusKey((key) => key + 1);
  }, []);

  const step = useCallback(
    (direction: 1 | -1) => {
      setCurrent((at) => steppedMatch(at, matches.length, direction));
      setReveal(true);
    },
    [matches.length],
  );

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const revealed = useCallback(() => {
    setReveal(false);
  }, []);

  useMetaShortcut("f", source !== null, show);

  return { open, focusKey, query, setQuery, matches, current, searching, failed, step, close, reveal, revealed };
}
