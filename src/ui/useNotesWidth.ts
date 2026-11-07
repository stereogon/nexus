/**
 * The width of the notes beside the document: loaded, re-fitted to the window, recorded.
 *
 * `null` until someone drags the divider, and then the stylesheet's default — a share of
 * the window — applies. Loading and recording are `useRecordedWidth`'s.
 */
import { useCallback, type RefObject } from "react";

import { fitNotesWidth, NOTES_MIN, widestNotes } from "./notesWidth";
import type { PaneSizing } from "./PaneDivider";
import { useElementSize } from "./useElementSize";
import { useRecordedWidth } from "./useRecordedWidth";

export function useNotesWidth(area: RefObject<HTMLElement | null>): PaneSizing {
  const { chosen, choose } = useRecordedWidth("notes");
  const { width: areaWidth } = useElementSize(area);

  const moveEdgeTo = useCallback(
    (edge: number, settled: boolean) => {
      const box = area.current?.getBoundingClientRect();

      if (box !== undefined) {
        // The notes are on the right: their width runs from the edge to the area's end.
        choose(fitNotesWidth(box.right - edge, box.width), settled);
      }
    },
    [area, choose],
  );

  const measured = areaWidth > 0;

  return {
    width: chosen === null || !measured ? null : fitNotesWidth(chosen, areaWidth),
    limits: measured ? { min: NOTES_MIN, max: widestNotes(areaWidth) } : null,
    moveEdgeTo,
  };
}
