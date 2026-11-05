/**
 * Taking the document to a cited highlight, and pulsing it there.
 *
 * `claude-spec.md` §2.4: clicking a `cite://<id>` badge in the notes scrolls the document
 * to the highlight's page, brings its box into view, and pulses a ring around it for a
 * moment so the eye finds it. The ring is a CSS animation that ends by itself; nothing
 * here waits for it.
 *
 * A citation whose highlight no longer exists — removed after it was cited — is reported
 * rather than ignored, so a click that "does nothing" says why.
 */
import { useEffect, useState, type RefObject } from "react";

import type { Annotation } from "../ipc/annotations";
import { bounding } from "../pdf/geometry";
import type { PageBox } from "../pdf/pages";
import { rectsOf } from "./HighlightLayer";
import type { ViewMode } from "./viewMode";

/** A request to show one annotation. `nonce` makes a second click on the same badge count. */
export interface Jump {
  readonly id: string;
  readonly nonce: number;
}

/** The highlight to pulse, on which page. */
export interface Pulse {
  readonly id: string;
  readonly pageIndex: number;
  readonly nonce: number;
}

/** Where on screen the target should land: a third of the way down, not hard against the top. */
const LANDING = 1 / 3;

/**
 * The scroll offset that puts `top` (from the top of the scroller) a third of the way down
 * a viewport `height` tall. Never negative.
 */
export function landingOffset(top: number, height: number): number {
  return Math.max(0, top - height * LANDING);
}

export function useJump({
  jump,
  annotations,
  boxes,
  mode,
  viewportHeight,
  scroller,
  goToPage,
}: {
  readonly jump: Jump | null;
  readonly annotations: readonly Annotation[];
  readonly boxes: readonly PageBox[];
  readonly mode: ViewMode;
  readonly viewportHeight: number;
  readonly scroller: RefObject<HTMLDivElement | null>;
  readonly goToPage: (index: number) => void;
}): { readonly pulse: Pulse | null; readonly missing: boolean } {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    // Cleared -- a different lecture opened, say -- takes the message and the ring with it.
    if (jump === null) {
      setMissing(false);
      setPulse(null);
      return;
    }

    const target = annotations.find((annotation) => annotation.id === jump.id);
    const rects = target === undefined ? null : rectsOf(target);
    const area = rects === null ? null : bounding(rects);
    const pageIndex = (target?.page ?? 0) - 1;
    const box = boxes[pageIndex];

    if (target === undefined || area === null || box === undefined) {
      setMissing(true);
      setPulse(null);
      return;
    }

    setMissing(false);
    setPulse({ id: target.id, pageIndex, nonce: jump.nonce });

    if (mode === "page") {
      // The page is swapped in; within it, the box is brought into view from the top.
      goToPage(pageIndex);
      scroller.current?.scrollTo({ top: landingOffset(area.y * box.height, viewportHeight) });
      return;
    }

    scroller.current?.scrollTo({
      top: landingOffset(box.top + area.y * box.height, viewportHeight),
      behavior: "smooth",
    });
    // Only a new request moves the document. The other inputs change as it scrolls and
    // re-fits, and re-running on them would drag the reader back to the highlight.
  }, [jump]);

  return { pulse, missing };
}
