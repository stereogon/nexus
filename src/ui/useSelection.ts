/**
 * What is selected on a page right now, and where to put a menu for it.
 *
 * # Why it listens for pointer and key releases rather than `selectionchange`
 *
 * `selectionchange` fires continuously while a selection is being dragged, so a menu
 * driven by it would appear on the first character and then chase the cursor across the
 * page. Waiting for the release means the menu appears once, where the selection ended.
 *
 * Keyboard selection is covered by the same rule through `keyup`, so shift-arrow produces
 * a menu too — leaving it out would make highlighting a mouse-only feature.
 */
import { useCallback, useEffect, useState } from "react";

import { candidateFrom, type HighlightCandidate } from "../pdf/selection";

/** A selection worth offering a menu for, and where that menu should sit. */
export interface Selected {
  readonly candidate: HighlightCandidate;
  /** Viewport coordinates, since the menu is positioned against the window. */
  readonly at: { readonly left: number; readonly top: number };
}

/** How far below the selection the menu sits, so it does not cover the last line. */
const MENU_GAP = 8;

/** Where to put the menu for the current selection, or `null` if there is nowhere. */
function anchorFor(selection: Selection | null): Selected["at"] | null {
  if (selection === null || selection.rangeCount === 0) {
    return null;
  }

  const rects = [...selection.getRangeAt(0).getClientRects()];
  const last = rects.at(-1);

  return last === undefined
    ? null
    : { left: last.left, top: last.bottom + MENU_GAP };
}

export function useSelection(): {
  readonly selected: Selected | null;
  readonly clear: () => void;
} {
  const [selected, setSelected] = useState<Selected | null>(null);

  const clear = useCallback(() => {
    setSelected(null);
  }, []);

  useEffect(() => {
    const read = () => {
      const selection = window.getSelection();
      const candidate = candidateFrom(selection);
      const at = anchorFor(selection);

      setSelected(candidate === null || at === null ? null : { candidate, at });
    };

    // On the document rather than on the page: a drag that starts on a page often ends
    // outside it, and a listener on the page would never hear the release.
    document.addEventListener("mouseup", read);
    document.addEventListener("keyup", read);

    return () => {
      document.removeEventListener("mouseup", read);
      document.removeEventListener("keyup", read);
    };
  }, []);

  return { selected, clear };
}
