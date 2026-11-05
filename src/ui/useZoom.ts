/**
 * The viewer's zoom: fitted to the pane's width, or pinned at a step someone chose.
 *
 * Moved out of `PdfViewer` on 2026-11-05, next to `zoom.ts`, which holds the steps this
 * moves between. Fit-width is recomputed from the pane's measured width on every render,
 * so opening the notes or the editor panel beside the document re-fits the page rather
 * than leaving it overflowing.
 */
import { useCallback, useState } from "react";

import { fitWidth } from "../pdf/pages";
import { stepFrom, ZOOM_LIMITS, type Zoom } from "./zoom";

/** Room for the bed to breathe either side of a page at fit-width. */
const BED_PADDING = 48;

export function useZoom(
  pageWidth: number,
  paneWidth: number,
): {
  readonly scale: number;
  readonly fitting: boolean;
  readonly step: (direction: 1 | -1) => void;
  readonly fit: () => void;
} {
  const [zoom, setZoom] = useState<Zoom>({ kind: "fit" });

  const scale =
    zoom.kind === "at"
      ? zoom.scale
      : fitWidth(pageWidth, Math.max(0, paneWidth - BED_PADDING), ZOOM_LIMITS);

  const step = useCallback(
    (direction: 1 | -1) => {
      setZoom({ kind: "at", scale: stepFrom(scale, direction) });
    },
    [scale],
  );

  const fit = useCallback(() => {
    setZoom({ kind: "fit" });
  }, []);

  return { scale, fitting: zoom.kind === "fit", step, fit };
}
