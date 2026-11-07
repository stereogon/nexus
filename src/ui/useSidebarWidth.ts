/**
 * The sidebar's width: loaded, re-fitted to the window, recorded (2026-11-07). The notes'
 * counterpart is `useNotesWidth`; loading and recording are `useRecordedWidth`'s.
 */
import { useCallback, useEffect, useState, type RefObject } from "react";

import type { PaneSizing } from "./PaneDivider";
import { fitSidebarWidth, SIDEBAR_MIN, widestSidebar } from "./sidebarWidth";
import { useRecordedWidth } from "./useRecordedWidth";

/**
 * The window's width, kept current. The panes span the window, and unlike the notes' area
 * they are not there to measure until a vault is open — after this hook first runs.
 */
function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const resized = () => {
      setWidth(window.innerWidth);
    };

    window.addEventListener("resize", resized);

    return () => {
      window.removeEventListener("resize", resized);
    };
  }, []);

  return width;
}

/** `panes` is the row of panes the sidebar starts, read when the divider moves. */
export function useSidebarWidth(panes: RefObject<HTMLElement | null>): PaneSizing {
  const { chosen, choose } = useRecordedWidth("sidebar");
  const areaWidth = useWindowWidth();

  const moveEdgeTo = useCallback(
    (edge: number, settled: boolean) => {
      const box = panes.current?.getBoundingClientRect();

      if (box !== undefined) {
        // The sidebar is on the left: its width runs from the window's side to the edge.
        choose(fitSidebarWidth(edge - box.left, box.width), settled);
      }
    },
    [panes, choose],
  );

  const measured = areaWidth > 0;

  return {
    width: chosen === null || !measured ? null : fitSidebarWidth(chosen, areaWidth),
    limits: measured ? { min: SIDEBAR_MIN, max: widestSidebar(areaWidth) } : null,
    moveEdgeTo,
  };
}
