/**
 * Drawing a box with Option held down: the drag itself, and the outline it leaves.
 *
 * `claude-spec.md` §2.3: "Hold Alt/Option and drag a bounding box around slide diagrams,
 * equations, or scanned regions." Option rather than a tool to switch on and off, so the
 * ordinary drag stays text selection and nobody has to remember which mode they left the
 * viewer in.
 *
 * The rules — the box between two points, the size below which it is a stray click, the
 * normalising — are in `pdf/area.ts`, where they are tested without a browser.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

import type { NormalizedRect } from "../ipc/annotations";
import { areaIn, boxBetween, type Point } from "../pdf/area";
import type { MenuAt } from "./menuPlacement";

/** A box being drawn: on which page, and what it covers so far. */
export interface Drawing {
  readonly pageIndex: number;
  /** `null` while it is still too small to mean anything. */
  readonly region: NormalizedRect | null;
}

/** Where the menu for a box goes: under its bottom-left corner, or above it. */
function menuFor(box: { left: number; top: number; height: number }): MenuAt {
  return { left: box.left, top: box.top + box.height + 8, above: box.top - 8 };
}

export function useAreaDraw(
  onDrawn: (pageIndex: number, region: NormalizedRect, at: MenuAt) => void,
): {
  readonly drawing: Drawing | null;
  readonly begin: (event: MouseEvent<HTMLElement>, pageIndex: number) => void;
} {
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const listening = useRef<AbortController | null>(null);

  // A drag still in progress when the viewer goes away must not leave document listeners
  // behind, firing into a component that no longer exists.
  useEffect(
    () => () => {
      listening.current?.abort();
    },
    [],
  );

  const begin = useCallback(
    (event: MouseEvent<HTMLElement>, pageIndex: number) => {
      if (!event.altKey || event.button !== 0) {
        return;
      }

      // Without this the same drag also starts a text selection underneath the box.
      event.preventDefault();
      document.getSelection()?.removeAllRanges();

      const sheet = event.currentTarget.getBoundingClientRect();
      const page = { left: sheet.left, top: sheet.top, width: sheet.width, height: sheet.height };
      const start: Point = { x: event.clientX, y: event.clientY };
      const controller = new AbortController();

      listening.current?.abort();
      listening.current = controller;
      setDrawing({ pageIndex, region: null });

      document.addEventListener(
        "mousemove",
        (moved) => {
          const box = boxBetween(start, { x: moved.clientX, y: moved.clientY });

          setDrawing({ pageIndex, region: areaIn(box, page) });
        },
        { signal: controller.signal },
      );

      document.addEventListener(
        "mouseup",
        (released) => {
          const box = boxBetween(start, { x: released.clientX, y: released.clientY });
          const region = areaIn(box, page);

          controller.abort();
          setDrawing(null);

          if (region !== null) {
            onDrawn(pageIndex, region, menuFor(box));
          }
        },
        { signal: controller.signal },
      );
    },
    [onDrawn],
  );

  return { drawing, begin };
}

/**
 * The outline to show on one page: the box being drawn, or else the one waiting for a
 * meaning to be chosen. Both are shown so the reader can see what they are about to mark.
 */
export function outlineOn(
  pageIndex: number,
  drawing: Drawing | null,
  waiting: { readonly pageIndex: number; readonly region: NormalizedRect } | null,
): NormalizedRect | null {
  if (drawing?.pageIndex === pageIndex) {
    return drawing.region;
  }

  return waiting?.pageIndex === pageIndex ? waiting.region : null;
}
