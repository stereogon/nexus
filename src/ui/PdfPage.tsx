/**
 * One page, drawn on its own canvas.
 *
 * # Why each page is its own component
 *
 * So that React unmounting it is what cancels its render. A single canvas redrawn for
 * whichever page is visible would need the cancellation bookkeeping written by hand, and
 * that is the bug: a stale render finishing after a new one has started paints the wrong
 * page over the right one.
 */
import { useEffect, useRef, useState } from "react";

import type { PageSource } from "../pdf/useDocument";
import { PdfTextLayer } from "./PdfTextLayer";

/**
 * The most pixels one canvas may hold.
 *
 * WebKit refuses to allocate a canvas past a platform limit and then silently gives back a
 * blank surface, so a page magnified to 600% on a retina display has to be allowed to
 * render slightly soft rather than not at all. 16 megapixels is comfortably inside the
 * limit on every macOS WebView.
 */
const MAX_CANVAS_PIXELS = 16_000_000;

/**
 * The pixel ratio to draw at: the display's, reduced if the page would be too large.
 *
 * Returned rather than applied so the caller can size the canvas and the draw call with
 * the same number.
 */
function pixelRatio(width: number, height: number): number {
  const display = Math.max(1, window.devicePixelRatio);
  const wanted = width * height * display * display;

  if (wanted <= MAX_CANVAS_PIXELS) {
    return display;
  }

  return Math.max(1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
}

export function PdfPage({
  index,
  scale,
  source,
  top,
  height,
  width,
}: {
  readonly index: number;
  readonly scale: number;
  readonly source: PageSource;
  readonly top: number;
  readonly height: number;
  readonly width: number;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [undrawn, setUndrawn] = useState(false);

  useEffect(() => {
    const session: { cancelled: boolean; stop: (() => void) | null } = {
      cancelled: false,
      stop: null,
    };

    // Read through a function, not directly. The flag is set by the cleanup below, which
    // TypeScript cannot follow: having narrowed it once it treats every later check as
    // redundant, and `no-unnecessary-condition` then rejects exactly the check that keeps a
    // finished render from touching an unmounted component.
    const live = () => !session.cancelled;

    void (async () => {
      try {
        const page = await source(index);
        const surface = canvas.current;

        if (!live() || surface === null) {
          return;
        }

        const unscaled = page.viewportAt(scale);
        const ratio = pixelRatio(unscaled.width, unscaled.height);

        // The canvas holds device pixels and CSS lays it out in layout pixels. Setting
        // only one of the two is what makes a PDF viewer look blurry on a retina screen.
        surface.width = Math.floor(unscaled.width * ratio);
        surface.height = Math.floor(unscaled.height * ratio);

        const render = page.draw(surface, scale * ratio);
        session.stop = render.cancel;

        await render.promise;

        // Cleared on success, because a page that failed at one zoom and drew at the next
        // should not keep the message: this effect re-runs on a scale change and the state
        // survives it.
        if (live()) {
          setUndrawn(false);
        }
      } catch {
        // A cancelled render rejects, and that is the ordinary case here: scrolling
        // unmounts pages mid-draw. The two are not distinguished by inspecting the
        // rejection -- pdf.js's cancellation type is not part of its public surface -- but
        // by whether *we* cancelled, which is known exactly.
        if (live()) {
          setUndrawn(true);
        }
      }
    })();

    return () => {
      session.cancelled = true;
      session.stop?.();
    };
  }, [index, scale, source]);

  return (
    <div
      aria-label={`Page ${String(index + 1)}`}
      className="pdf-page"
      // Read back by `candidateFrom` to say which page a selection is on. An attribute
      // rather than a lookup through React, because the selection arrives as a DOM node
      // and climbing from it is the only thing that works for a text node inside the
      // layer pdf.js builds.
      data-page={index}
      style={{ top, height, width }}
    >
      {/* The canvas is hidden from assistive technology on purpose: it is a picture of
          text that the layer below carries as real text. Labelling both would read the
          page twice, and labelling only the canvas would read it as "Page 4" and no
          content. */}
      <canvas
        aria-hidden="true"
        className="pdf-canvas"
        ref={canvas}
        style={{ width, height }}
      />
      <PdfTextLayer index={index} scale={scale} source={source} />
      {undrawn && (
        <p className="pdf-undrawn">
          This page could not be drawn. The rest of the document is unaffected.
        </p>
      )}
    </div>
  );
}
