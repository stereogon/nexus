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
import { useEffect, useRef, useState } from "react";

import { markBoxes, type MarkBox, type PageMatch } from "../pdf/find";
import { keepSelectionWhole } from "../pdf/textLayerSelection";
import type { PageSource } from "../pdf/useDocument";

export function PdfTextLayer({
  index,
  scale,
  source,
  found,
  reveal,
  onRevealed,
}: {
  readonly index: number;
  readonly scale: number;
  readonly source: PageSource;
  /** Find-in-document's matches on this page; the same array until they change. */
  readonly found: readonly PageMatch[];
  /** Whether the current match is on this page and should be scrolled into view. */
  readonly reveal: boolean;
  readonly onRevealed: () => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  // Counts finished layouts, so the marks are measured against the spans as drawn now.
  const [drawn, setDrawn] = useState(0);
  const [marks, setMarks] = useState<readonly MarkBox[]>([]);
  const currentMark = useRef<HTMLDivElement | null>(null);

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
          setDrawn((count) => count + 1);
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

  // Measured by the browser from the spans themselves, so the marks follow pdf.js's own
  // stretching of each run to its glyphs, at any zoom.
  useEffect(() => {
    const layer = container.current;

    setMarks(layer === null || drawn === 0 || found.length === 0 ? [] : markBoxes(layer, found));
  }, [drawn, found]);

  useEffect(() => {
    if (reveal && currentMark.current !== null) {
      currentMark.current.scrollIntoView({ block: "center" });
      onRevealed();
    }
  }, [marks, reveal, onRevealed]);

  // The text layer is not `aria-hidden`: these spans are the page's actual text, and the
  // canvas above is the one hidden from assistive technology. The marks are decoration —
  // the find bar says which match is current.
  return (
    <>
      <div className="textLayer" ref={container} />
      {marks.length > 0 && (
        <div aria-hidden="true" className="find-marks">
          {marks.map((mark, at) => (
            <div
              className={mark.current ? "find-mark current" : "find-mark"}
              key={`${String(at)}:${String(mark.left)}:${String(mark.top)}`}
              ref={mark.current ? currentMark : undefined}
              style={{ left: mark.left, top: mark.top, width: mark.width, height: mark.height }}
            />
          ))}
        </div>
      )}
    </>
  );
}
