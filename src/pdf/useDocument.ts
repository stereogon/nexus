/**
 * Opening a document and measuring its pages.
 *
 * Sizes are taken at `scale: 1`, which is the unscaled page and the basis §3 fixes
 * annotation coordinates against. `getViewport` already accounts for a page's `/Rotate`,
 * so a rotated page reports the dimensions it is actually drawn at rather than the ones
 * stored in the file — which is the whole reason the measurement goes through pdf.js
 * instead of reading the MediaBox.
 */
import { useEffect, useState } from "react";

import { asCommandError, type CommandError } from "../ipc/vault";
import { TextLayer } from "pdfjs-dist";

import { loadPdf } from "./engine";

/** One page's unscaled size. */
export interface PageSize {
  readonly width: number;
  readonly height: number;
}

/** A document being opened, open, or refused. */
export interface LoadedDocument {
  /** True until the answer is known. */
  readonly loading: boolean;
  /** Pages in order, unscaled. Empty until loaded. */
  readonly sizes: readonly PageSize[];
  /** Why it could not be opened, if it could not. */
  readonly failure: CommandError | null;
}

/** The page handle a renderer needs, kept out of React state. */
export type PageSource = (index: number) => Promise<RenderablePage>;

/** What `PdfPage` needs to draw: a viewport at a scale, and a render call. */
export interface RenderablePage {
  readonly viewportAt: (scale: number) => { width: number; height: number };
  readonly draw: (
    canvas: HTMLCanvasElement,
    scale: number,
  ) => { readonly promise: Promise<void>; readonly cancel: () => void };
  /**
   * Lays this page's text out, invisibly, over the drawn pixels.
   *
   * A canvas is pixels and holds no text, so without this there is nothing on a page for a
   * cursor to take hold of. pdf.js builds a transparent run of spans positioned glyph by
   * glyph; the browser's own selection then works on them, which is what makes selecting,
   * copying and — next — highlighting possible.
   */
  readonly drawText: (
    container: HTMLElement,
    scale: number,
  ) => { readonly promise: Promise<void>; readonly cancel: () => void };
  /**
   * The page's text as one string: each text run's characters, joined with nothing between
   * them. That is exactly what the text layer's spans hold, in order, so an offset found in
   * this string is the same offset in the drawn layer — which is how find marks a match.
   */
  readonly text: () => Promise<string>;
}

const NOTHING: LoadedDocument = { loading: false, sizes: [], failure: null };

/**
 * Opens `url` and measures every page.
 *
 * Returns the state *and* a page source. The `PDFDocumentProxy` itself is deliberately not
 * React state: it is a mutable handle with a `destroy`, and putting it in state invites a
 * render to read one that has been destroyed. The source closes over it instead, and is
 * replaced wholesale when the document changes.
 */
export function usePdfDocument(url: string | null): {
  readonly state: LoadedDocument;
  readonly page: PageSource | null;
} {
  const [state, setState] = useState<LoadedDocument>(NOTHING);
  const [page, setPage] = useState<PageSource | null>(null);

  useEffect(() => {
    if (url === null) {
      setState(NOTHING);
      setPage(null);

      return undefined;
    }

    const session = { cancelled: false };
    const task = loadPdf(url);

    setState({ loading: true, sizes: [], failure: null });

    void (async () => {
      try {
        const document = await task.promise;

        // Measured up front, because the scroller needs every page's height to place any
        // of them. One `getPage` per page on a 300-page lecture is the cost of a scrollbar
        // that does not change length as you scroll.
        const sizes: PageSize[] = [];

        for (let number = 1; number <= document.numPages; number += 1) {
          const measured = await document.getPage(number);
          const { width, height } = measured.getViewport({ scale: 1 });

          sizes.push({ width, height });
        }

        if (session.cancelled) {
          return;
        }

        setPage(() => async (index: number) => {
          const loaded = await document.getPage(index + 1);

          return {
            viewportAt: (scale: number) => loaded.getViewport({ scale }),
            // pdf.js 6 wants the canvas itself, not only its context, so it can size
            // and reset the surface between renders.
            draw: (canvas: HTMLCanvasElement, scale: number) => {
              const render = loaded.render({
                canvas,
                viewport: loaded.getViewport({ scale }),
              });

              return {
                promise: render.promise,
                cancel: () => {
                  render.cancel();
                },
              };
            },

            text: async () => {
              const content = await loaded.getTextContent();

              return content.items.map((item) => ("str" in item ? item.str : "")).join("");
            },

            drawText: (container: HTMLElement, scale: number) => {
              // Streamed rather than awaited whole, so a dense page's spans appear as they
              // are measured instead of after the last one.
              const layer = new TextLayer({
                textContentSource: loaded.streamTextContent(),
                container,
                viewport: loaded.getViewport({ scale }),
              });

              return {
                promise: layer.render(),
                cancel: () => {
                  layer.cancel();
                },
              };
            },
          };
        });
        setState({ loading: false, sizes, failure: null });
      } catch (thrown: unknown) {
        if (!session.cancelled) {
          setPage(null);
          setState({
            loading: false,
            sizes: [],
            failure: asCommandError(thrown),
          });
        }
      }
    })();

    return () => {
      session.cancelled = true;

      // Shuts down the worker and abandons any range request still in flight. Without it,
      // closing a lecture mid-load leaves a worker decoding pages nothing will draw.
      void task.destroy();
    };
  }, [url]);

  return { state, page };
}
