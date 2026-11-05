/**
 * The invisible text over a drawn page, which is what a cursor can actually grab.
 *
 * # Why a page needs this at all
 *
 * `PdfPage` draws pixels. Pixels contain no text, so a canvas-only viewer is a picture of a
 * document: nothing to select, nothing to copy, and nothing for a highlight to attach to.
 * pdf.js solves it with a separate layer of transparent spans, positioned glyph by glyph
 * over the same pixels, and the browser's own selection machinery does the rest.
 *
 * This is also the foundation of M3's remaining work: the four highlight semantics and
 * `Link to notes` both begin from a selection, and a selection begins here.
 *
 * # Why it is its own component
 *
 * Same reason each page is: unmounting cancels it. A text layer is rebuilt on every zoom
 * change, and a half-finished layer left attached would stack a second set of spans over
 * the first — which reads as doubled, unselectable text.
 */
import { useEffect, useRef } from "react";

import { keepSelectionWhole } from "../pdf/textLayerSelection";
import type { PageSource } from "../pdf/useDocument";

export function PdfTextLayer({
  index,
  scale,
  source,
}: {
  readonly index: number;
  readonly scale: number;
  readonly source: PageSource;
}) {
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const session: {
      cancelled: boolean;
      stop: (() => void) | null;
      release: (() => void) | null;
    } = {
      cancelled: false,
      stop: null,
      release: null,
    };

    // Read through a function for the same reason as in `PdfPage`: TypeScript narrows the
    // flag once and then treats the check that matters as redundant.
    const live = () => !session.cancelled;

    void (async () => {
      try {
        const page = await source(index);
        const target = container.current;

        if (!live() || target === null) {
          return;
        }

        // pdf.js sizes every span against this, so it has to be set before the layer is
        // built. Its own viewer sets it on a wrapper; here the layer's own element is the
        // wrapper, which keeps the variable next to the thing that reads it.
        target.style.setProperty("--total-scale-factor", String(scale));

        const layer = page.drawText(target, scale);
        session.stop = layer.cancel;

        await layer.promise;

        // After the spans, never before: the trailing element it adds has to come last
        // for a drag past the end of the text to land on it.
        if (live()) {
          session.release = keepSelectionWhole(target);
        }
      } catch {
        // A cancelled layout rejects, which is the ordinary case: zooming and scrolling
        // both abandon one. Nothing is shown for a failure here because the page itself is
        // still perfectly readable — only selection is lost, and a banner saying so over a
        // legible page would be noise. The gap is recorded in PROGRESS.md instead.
      }
    })();

    return () => {
      session.cancelled = true;
      session.stop?.();
      session.release?.();

      // pdf.js's `cancel` stops the work but leaves what it has already appended. Clearing
      // the element is what keeps a re-render from stacking a second set of spans over the
      // first.
      if (container.current !== null) {
        container.current.replaceChildren();
      }
    };
  }, [index, scale, source]);

  // Not `aria-hidden`: these spans are the page's actual text, and the canvas above is
  // the one hidden from assistive technology.
  return <div className="textLayer" ref={container} />;
}
