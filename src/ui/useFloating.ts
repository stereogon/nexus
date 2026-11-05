/**
 * What every floating bar over a selection needs: to stay inside the window, and to go
 * away on Escape.
 *
 * Moved out of `HighlightMenu` on 2026-11-05 when the notes' format bar needed the same, so
 * the two cannot drift into placing themselves differently.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { placeMenu, type MenuAt } from "./menuPlacement";

export function useFloating(
  at: MenuAt,
  onDismiss: () => void,
): { readonly box: RefObject<HTMLDivElement | null>; readonly placed: { left: number; top: number } } {
  const box = useRef<HTMLDivElement | null>(null);
  const { left, top, above } = at;
  const [placed, setPlaced] = useState({ left, top });

  // Before paint, not after: `useEffect` would show the bar off the edge for one frame and
  // then snap it back, which reads as a flicker rather than as a bar opening.
  useLayoutEffect(() => {
    const element = box.current;

    if (element === null) {
      return;
    }

    const measured = element.getBoundingClientRect();

    setPlaced(
      placeMenu(
        { left, top, above },
        { width: measured.width, height: measured.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
    // Depends on the three numbers rather than on `at`, which is rebuilt every render and
    // would make this effect run forever.
  }, [left, top, above]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  return { box, placed };
}
