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
import { PdfToolbar } from "./PdfToolbar";
import type { ViewMode } from "./viewMode";

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
  const [mode, setMode] = useState<ViewMode>("scroll");
  // Only consulted in page mode. In scroll mode the page being read is derived from the
  // scroll offset instead, so there is one source of truth per mode rather than two that
  // can disagree.
  const [pageIndex, setPageIndex] = useState(0);
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
  const lastPage = Math.max(0, state.sizes.length - 1);
  const showing =
    mode === "page"
      ? Math.min(pageIndex, lastPage)
      : currentIndex(boxes, scrollTop, viewport.height);

  // One page mounted in page mode, the visible run plus its buffer in scroll mode.
  const window =
    mode === "page"
      ? state.sizes.length === 0
        ? null
        : { first: showing, last: showing }
      : renderWindow(boxes, scrollTop, viewport.height);

  const shown = boxes[showing];
  const stackHeight =
    mode === "page" ? (shown?.height ?? 0) : totalHeight(boxes);

  const onScroll = useCallback(() => {
    setScrollTop(scroller.current?.scrollTop ?? 0);
  }, []);

  const changeZoom = useCallback(
    (direction: 1 | -1) => {
      setZoom({ kind: "at", scale: stepFrom(scale, direction) });
    },
    [scale],
  );

  /**
   * Goes to a page, in whichever way the current mode means.
   *
   * Scrolling rather than setting state in scroll mode is deliberate: the counter is
   * derived from the scroll offset there, so moving the offset is what moves the counter.
   * Setting a separate index as well would give two sources of truth that drift apart the
   * moment someone scrolls by hand.
   */
  const goTo = useCallback(
    (index: number) => {
      const wanted = Math.min(Math.max(0, index), lastPage);

      if (mode === "page") {
        setPageIndex(wanted);

        // Back to the top of the new page: keeping the old offset would open a page
        // part-way down for no reason the reader can see.
        scroller.current?.scrollTo({ top: 0 });

        return;
      }

      const box = boxes[wanted];

      if (box !== undefined) {
        scroller.current?.scrollTo({ top: box.top, behavior: "smooth" });
      }
    },
    [boxes, lastPage, mode],
  );

  /** Switches layout, keeping the page the person was reading. */
  const changeMode = useCallback(
    (next: ViewMode) => {
      if (next === mode) {
        return;
      }

      // Captured before the switch, because `showing` is computed differently either side
      // of it and the whole point is to land on the same page.
      const staying = showing;

      setMode(next);
      setPageIndex(staying);

      if (next === "scroll") {
        // After the stack is laid out again, or the offset is applied to the old one.
        requestAnimationFrame(() => {
          scroller.current?.scrollTo({ top: boxes[staying]?.top ?? 0 });
        });
      } else {
        scroller.current?.scrollTo({ top: 0 });
      }
    },
    [boxes, mode, showing],
  );

  return (
    <section className="viewer">
      <PdfToolbar
        fitting={zoom.kind === "fit"}
        limits={ZOOM_LIMITS}
        mode={mode}
        onClose={onClose}
        onFit={() => {
          setZoom({ kind: "fit" });
        }}
        onGoTo={goTo}
        onMode={changeMode}
        onZoom={changeZoom}
        pages={state.sizes.length}
        scale={scale}
        showing={showing}
        title={title}
      />

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

        <div className="pdf-stack" style={{ height: stackHeight }}>
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
                  // In page mode the one mounted page sits at the top of its own stack,
                  // not at the offset it would have had in the full document.
                  top={mode === "page" ? 0 : box.top}
                  width={size.width * scale}
                />
              );
            })}
        </div>
      </div>
    </section>
  );
}
