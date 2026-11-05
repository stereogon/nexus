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
import { useCallback, useEffect, useRef, useState } from "react";

import {
  addAreaHighlight,
  addHighlight,
  addTextBox,
  editTextBox,
  loadAnnotations,
  removeAnnotation,
  retagAnnotation,
  type Annotation,
  type HighlightSemantic,
  type NewHighlight,
  type NormalizedRect,
  type TextBoxEdit,
} from "../ipc/annotations";
import { asCommandError, type CommandError } from "../ipc/vault";
import type { HighlightCandidate } from "../pdf/selection";
import { movedId, NO_HISTORY, recorded, redone, run, toward, undone, type History, type Step } from "./annotationHistory";

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

/**
 * The list after one annotation changed: the stored version in place of the old one,
 * appended if it is new, or gone for `null`.
 *
 * `null` from the backend means the lecture no longer has that annotation, so the window
 * stops drawing it. Keeping it would leave a highlight on screen that the file does not
 * hold, and the next click on its badge would be answered "not there" again. A replaced
 * one keeps its place, so a recoloured highlight does not jump in the list.
 */
export function withChange(
  held: readonly Annotation[],
  id: string,
  stored: Annotation | null,
): readonly Annotation[] {
  if (stored === null) {
    return held.filter((annotation) => annotation.id !== id);
  }

  return held.some((annotation) => annotation.id === id)
    ? held.map((annotation) => (annotation.id === id ? stored : annotation))
    : [...held, stored];
}

export interface Annotations {
  /** Every annotation on the lecture. */
  readonly all: readonly Annotation[];
  /** What went wrong last, or `null`. */
  readonly failure: CommandError | null;
  /**
   * Stores a highlight over what was selected. Resolves to it as stored — so "Link to
   * notes" can cite the id the backend gave it — or to `null` if the save failed, which is
   * reported through `failure`.
   */
  readonly add: (
    candidate: HighlightCandidate,
    semantic: HighlightSemantic,
  ) => Promise<Annotation | null>;
  /** Stores a box drawn on a page, counting pages from zero. Resolves as `add` does. */
  readonly addArea: (
    pageIndex: number,
    region: NormalizedRect,
    semantic: HighlightSemantic,
  ) => Promise<Annotation | null>;
  /** Puts a sticky note on a page, counting pages from zero. Resolves as `add` does. */
  readonly addTextBox: (pageIndex: number, region: NormalizedRect, text: string) => Promise<Annotation | null>;
  /** Moves, resizes or rewords a sticky note. */
  readonly editTextBox: (id: string, edit: TextBoxEdit) => void;
  /** Removes one highlight. */
  readonly remove: (id: string) => void;
  /** Marks one highlight as something else, keeping its id. */
  readonly retag: (id: string, semantic: HighlightSemantic) => void;
  /** Takes back the last change made here, or does again the last one taken back. */
  readonly undo: () => void;
  readonly redo: () => void;
  /** Forgets the last failure. */
  readonly clearFailure: () => void;
}

export function useAnnotations(vault: string, directory: string): Annotations {
  const [all, setAll] = useState<readonly Annotation[]>([]);
  const [failure, setFailure] = useState<CommandError | null>(null);
  // Read by the commands below, which need the annotation as it was before they ran.
  const held = useRef<readonly Annotation[]>([]);
  const history = useRef<History>(NO_HISTORY);
  // One undo or redo at a time: two in flight on one annotation would race in the file.
  const travelling = useRef(false);

  useEffect(() => {
    held.current = all;
  }, [all]);

  useEffect(() => {
    const session = { cancelled: false };

    // A history belongs to the lecture it was made in.
    history.current = NO_HISTORY;

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

  /**
   * Runs one command for one annotation and, once it has succeeded, draws what the backend
   * stored and records the step. Nothing is drawn first: showing a change before the write
   * would show what the file does not hold if the write then failed. Resolves to what was
   * stored, or `null` on failure, which is reported through `failure`.
   */
  const change = useCallback(
    async (id: string | null, command: () => Promise<Annotation | null>, record: boolean) => {
      const before = id === null ? null : (held.current.find((annotation) => annotation.id === id) ?? null);

      try {
        const after = await command();
        const changed = after?.id ?? id;

        if (changed !== null) {
          setAll((list) => withChange(list, changed, after));
        }

        // Compared by content: re-marking with the colour it has stores nothing new, and a
        // step for it would be an undo press that does nothing.
        if (record && JSON.stringify(before) !== JSON.stringify(after)) {
          history.current = recorded(history.current, { before, after });
        }

        setFailure(null);
        return after;
      } catch (thrown: unknown) {
        setFailure(asCommandError(thrown));
        return null;
      }
    },
    [],
  );

  const add = useCallback(
    (candidate: HighlightCandidate, semantic: HighlightSemantic) =>
      change(null, () => addHighlight(vault, directory, asNewHighlight(candidate, semantic)), true),
    [change, vault, directory],
  );

  const addArea = useCallback(
    // The same zero-to-one page conversion `asNewHighlight` names and tests.
    (pageIndex: number, region: NormalizedRect, semantic: HighlightSemantic) =>
      change(null, () => addAreaHighlight(vault, directory, { page: pageIndex + 1, semantic, region }), true),
    [change, vault, directory],
  );

  const addNote = useCallback(
    (pageIndex: number, region: NormalizedRect, text: string) =>
      change(null, () => addTextBox(vault, directory, { page: pageIndex + 1, region, text }), true),
    [change, vault, directory],
  );

  const editNote = useCallback(
    (id: string, edit: TextBoxEdit) => {
      void change(id, () => editTextBox(vault, directory, id, edit), true);
    },
    [change, vault, directory],
  );

  const remove = useCallback(
    (id: string) => {
      void change(id, () => removeAnnotation(vault, directory, id).then(() => null), true);
    },
    [change, vault, directory],
  );

  const retag = useCallback(
    (id: string, semantic: HighlightSemantic) => {
      void change(id, () => retagAnnotation(vault, directory, id, semantic), true);
    },
    [change, vault, directory],
  );

  /** Takes one step from the history and runs its move — not itself recorded. */
  const travel = useCallback(
    (take: typeof undone, target: (step: Step) => readonly [Annotation | null, Annotation | null]) => {
      const taken = take(history.current);

      if (travelling.current || taken === null) {
        return;
      }

      history.current = taken.history;

      const [from, to] = target(taken.step);
      const move = toward(from, to);

      if (move === null) {
        return;
      }

      travelling.current = true;
      void change(movedId(move), () => run(vault, directory, move), false).finally(() => {
        travelling.current = false;
      });
    },
    [change, vault, directory],
  );

  const undo = useCallback(() => {
    travel(undone, (step) => [step.after, step.before]);
  }, [travel]);

  const redo = useCallback(() => {
    travel(redone, (step) => [step.before, step.after]);
  }, [travel]);

  const clearFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return {
    all,
    failure,
    add,
    addArea,
    addTextBox: addNote,
    editTextBox: editNote,
    remove,
    retag,
    undo,
    redo,
    clearFailure,
  };
}
