/**
 * The document pane: a light page on a dark bed, virtualised.
 *
 * Taken from the canvas's *Workspace* artboards, whose viewer toolbar reads
 * `4 / 18 · − · 124% · + · Fit width`. §3 makes that authoritative, so the controls are
 * those controls in that order, and the page surface stays light in both themes — there is
 * no dark-mode inversion, because inverting a page ruins photographs, colour-coded
 * diagrams and scans. Confirmed with the user on 2026-10-28.
 *
 * Only the visible pages and a two-page buffer are mounted. The arithmetic for that lives
 * in `../pdf/pages`, tested on its own, so this file reads scroll offsets and draws.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { documentUrl, type OpenedDocument } from "../ipc/document";
import {
  currentIndex,
  fitWidth,
  renderWindow,
  stack,
  totalHeight,
} from "../pdf/pages";
import { usePdfDocument } from "../pdf/useDocument";
import { DocumentNotice } from "./DocumentNotice";
import { PdfPage } from "./PdfPage";

/** The gap between pages, matching the artboard's page separation. */
const PAGE_GAP = 16;

/** Room for the bed to breathe either side of a page at fit-width. */
const BED_PADDING = 48;

const ZOOM_LIMITS = { min: 0.25, max: 6 } as const;

/** The zoom steps `−` and `+` move through, rather than a blind multiplier. */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6] as const;

type Zoom = { readonly kind: "fit" } | { readonly kind: "at"; readonly scale: number };

function stepFrom(scale: number, direction: 1 | -1): number {
  const ordered = direction === 1 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  const next = ordered.find((step) =>
    direction === 1 ? step > scale + 0.001 : step < scale - 0.001,
  );

  return next ?? scale;
}

export function PdfViewer({
  document,
  title,
  onClose,
}: {
  readonly document: OpenedDocument;
  readonly title: string;
  readonly onClose: () => void;
}) {
  const { state, page } = usePdfDocument(documentUrl(document));
  const scroller = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<Zoom>({ kind: "fit" });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  // Measured rather than assumed, because fit-width is a function of the pane's width and
  // the pane is a split the person can drag.
  useEffect(() => {
    const element = scroller.current;

    if (element === null) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setViewport({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const first = state.sizes[0];
  const scale =
    zoom.kind === "at"
      ? zoom.scale
      : fitWidth(
          first?.width ?? 0,
          Math.max(0, viewport.width - BED_PADDING),
          ZOOM_LIMITS,
        );

  const boxes = stack(
    state.sizes.map((size) => size.height * scale),
    PAGE_GAP,
  );
  const window = renderWindow(boxes, scrollTop, viewport.height);
  const showing = currentIndex(boxes, scrollTop, viewport.height);

  const onScroll = useCallback(() => {
    setScrollTop(scroller.current?.scrollTop ?? 0);
  }, []);

  const changeZoom = useCallback(
    (direction: 1 | -1) => {
      setZoom({ kind: "at", scale: stepFrom(scale, direction) });
    },
    [scale],
  );

  return (
    <section className="viewer">
      <div className="viewer-bar">
        <button className="quiet" onClick={onClose} type="button">
          ← Vault
        </button>
        <span className="viewer-title">{title}</span>

        <span className="viewer-pages">
          {state.sizes.length === 0
            ? "—"
            : `${String(showing + 1)} / ${String(state.sizes.length)}`}
        </span>

        <div className="viewer-zoom">
          <button
            aria-label="Zoom out"
            className="quiet"
            disabled={scale <= ZOOM_LIMITS.min}
            onClick={() => {
              changeZoom(-1);
            }}
            type="button"
          >
            −
          </button>
          <span className="viewer-scale">{`${String(Math.round(scale * 100))}%`}</span>
          <button
            aria-label="Zoom in"
            className="quiet"
            disabled={scale >= ZOOM_LIMITS.max}
            onClick={() => {
              changeZoom(1);
            }}
            type="button"
          >
            +
          </button>
          <button
            className={zoom.kind === "fit" ? "quiet on" : "quiet"}
            onClick={() => {
              setZoom({ kind: "fit" });
            }}
            type="button"
          >
            Fit width
          </button>
        </div>
      </div>

      <DocumentNotice
        needsAttention={document.needsAttention}
        risks={document.risks}
      />

      <div className="viewer-bed" onScroll={onScroll} ref={scroller}>
        {state.loading && <p className="note">Opening the document…</p>}
        {state.failure !== null && (
          <div className="card error">
            <div className="code">{state.failure.code}</div>
            <div>{state.failure.remediation}</div>
          </div>
        )}

        <div className="pdf-stack" style={{ height: totalHeight(boxes) }}>
          {window !== null &&
            page !== null &&
            state.sizes.slice(window.first, window.last + 1).map((size, offset) => {
              const index = window.first + offset;
              const box = boxes[index];

              return box === undefined ? null : (
                <PdfPage
                  height={box.height}
                  index={index}
                  key={index}
                  scale={scale}
                  source={page}
                  top={box.top}
                  width={size.width * scale}
                />
              );
            })}
        </div>
      </div>
    </section>
  );
}
