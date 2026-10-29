/**
 * The highlights stored on the lecture being read.
 *
 * # Why the window never holds the whole file
 *
 * `add` and `remove` each call one command that loads, changes and saves. This hook keeps
 * only what it was told about: the list it loaded, plus whatever Rust handed back. It
 * never sends a set, so a kind it could not parse — an iPad running ahead, a newer build —
 * cannot be dropped by something made here.
 *
 * The annotation added to the list is the one Rust returned, not a local copy made while
 * waiting. Rust mints the id and stamps the time, so an optimistic copy would be a second
 * version of one record, and the optimistic one would be the one with the wrong id in it.
 */
import { useCallback, useEffect, useState } from "react";

import {
  addHighlight,
  loadAnnotations,
  removeAnnotation,
  type Annotation,
  type HighlightSemantic,
  type NewHighlight,
} from "../ipc/annotations";
import { asCommandError, type CommandError } from "../ipc/vault";
import type { HighlightCandidate } from "../pdf/selection";

/**
 * Turns a candidate into the request Rust expects.
 *
 * The one thing it does is the page conversion, and it is the reason this is a named
 * function rather than an object literal inside a callback: the window counts pages from
 * zero and the file counts from one. An off-by-one here stores every highlight on the
 * wrong page, which is invisible until someone reopens the lecture.
 */
export function asNewHighlight(
  candidate: HighlightCandidate,
  semantic: HighlightSemantic,
): NewHighlight {
  return {
    page: candidate.pageIndex + 1,
    semantic,
    quote: candidate.quote,
    rects: candidate.rects,
  };
}

/** The highlights on one page, counting pages from zero. */
export function onPage(
  annotations: readonly Annotation[],
  pageIndex: number,
): readonly Annotation[] {
  return annotations.filter((annotation) => annotation.page === pageIndex + 1);
}

export interface Annotations {
  /** Every annotation on the lecture. */
  readonly all: readonly Annotation[];
  /** What went wrong last, or `null`. */
  readonly failure: CommandError | null;
  /** Stores a highlight over what was selected. */
  readonly add: (
    candidate: HighlightCandidate,
    semantic: HighlightSemantic,
  ) => void;
  /** Removes one highlight. */
  readonly remove: (id: string) => void;
  /** Forgets the last failure. */
  readonly clearFailure: () => void;
}

export function useAnnotations(vault: string, directory: string): Annotations {
  const [all, setAll] = useState<readonly Annotation[]>([]);
  const [failure, setFailure] = useState<CommandError | null>(null);

  useEffect(() => {
    const session = { cancelled: false };

    // Read through a function, not directly, for the same reason `PdfPage` does it: the
    // flag is set by the cleanup below, which TypeScript cannot follow, and having
    // narrowed it once it treats every later check as redundant --
    // `no-unnecessary-condition` then rejects exactly the check that keeps a finished load
    // from writing into an unmounted component.
    const live = () => !session.cancelled;

    void (async () => {
      try {
        const loaded = await loadAnnotations(vault, directory);

        if (live()) {
          setAll(loaded);
          setFailure(null);
        }
      } catch (thrown: unknown) {
        if (live()) {
          // Emptied as well as reported: showing the previous lecture's highlights over
          // this one's pages would be worse than showing none.
          setAll([]);
          setFailure(asCommandError(thrown));
        }
      }
    })();

    return () => {
      session.cancelled = true;
    };
  }, [vault, directory]);

  const add = useCallback(
    (candidate: HighlightCandidate, semantic: HighlightSemantic) => {
      void (async () => {
        try {
          const made = await addHighlight(
            vault,
            directory,
            asNewHighlight(candidate, semantic),
          );

          setAll((held) => [...held, made]);
          setFailure(null);
        } catch (thrown: unknown) {
          setFailure(asCommandError(thrown));
        }
      })();
    },
    [vault, directory],
  );

  const remove = useCallback(
    (id: string) => {
      void (async () => {
        try {
          await removeAnnotation(vault, directory, id);

          // Dropped on success only. Removing it from the list first would show the
          // highlight gone while the file still held it, and a failed write would leave
          // the window disagreeing with the disk until the lecture was reopened.
          setAll((held) => held.filter((annotation) => annotation.id !== id));
          setFailure(null);
        } catch (thrown: unknown) {
          setFailure(asCommandError(thrown));
        }
      })();
    },
    [vault, directory],
  );

  const clearFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { all, failure, add, remove, clearFailure };
}
