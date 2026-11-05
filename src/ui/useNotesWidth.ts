/**
 * The width of the notes beside the document: loaded, re-fitted to the window, recorded.
 *
 * `null` until someone drags the divider, and then the stylesheet's default — a share of
 * the window — applies. A width is recorded only when a drag ends or a key is pressed, not
 * on every pointer move: the file is one line, but a write per frame would be dozens per
 * second for a value only the last of which matters.
 */
import { useCallback, useEffect, useState, type RefObject } from "react";

import { lastNotesWidth, rememberNotesWidth } from "../ipc/layout";
import { fitNotesWidth, NOTES_MIN, widestNotes } from "./notesWidth";
import { useElementSize } from "./useElementSize";

export interface NotesWidth {
  /** The width to draw the notes at, or `null` for the stylesheet's default. */
  readonly width: number | null;
  /** What the divider can move between, for a screen reader; `null` before layout. */
  readonly limits: { readonly min: number; readonly max: number } | null;
  /** Puts the notes' left edge at `edge`, in window coordinates; `settled` records it. */
  readonly moveEdgeTo: (edge: number, settled: boolean) => void;
}

export function useNotesWidth(area: RefObject<HTMLElement | null>): NotesWidth {
  const [chosen, setChosen] = useState<number | null>(null);
  const { width: areaWidth } = useElementSize(area);

  useEffect(() => {
    const session = { cancelled: false };

    void (async () => {
      const recorded = await lastNotesWidth();

      if (!session.cancelled) {
        // Only if nothing was dragged meanwhile: a drag is newer than the file.
        setChosen((current) => current ?? recorded);
      }
    })();

    return () => {
      session.cancelled = true;
    };
  }, []);

  const moveEdgeTo = useCallback(
    (edge: number, settled: boolean) => {
      const box = area.current?.getBoundingClientRect();

      if (box === undefined) {
        return;
      }

      const fitted = fitNotesWidth(box.right - edge, box.width);

      setChosen(fitted);

      if (settled) {
        void rememberNotesWidth(fitted);
      }
    },
    [area],
  );

  const measured = areaWidth > 0;

  return {
    width: chosen === null || !measured ? null : fitNotesWidth(chosen, areaWidth),
    limits: measured ? { min: NOTES_MIN, max: widestNotes(areaWidth) } : null,
    moveEdgeTo,
  };
}
