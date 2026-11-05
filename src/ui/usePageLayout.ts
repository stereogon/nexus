/**
 * Where the pages are, which of them are drawn, and moving between them — in either layout.
 *
 * Moved out of `PdfViewer` on 2026-11-05, unchanged, when find-in-document needed room
 * there. Scroll mode stacks every page and derives the page being read from the scroll
 * offset; page mode shows one page and keeps its own index. Only the visible pages and a
 * two-page buffer are mounted; the arithmetic is in `../pdf/pages`, tested on its own.
 */
import { useCallback, useState, type RefObject } from "react";

import { currentIndex, renderWindow, scrollTarget, stack, totalHeight, type PageBox } from "../pdf/pages";
import type { PageSize } from "../pdf/useDocument";
import type { ViewMode } from "./viewMode";

/** The gap between pages, matching the artboard's page separation. */
const PAGE_GAP = 16;

export function usePageLayout(
  sizes: readonly PageSize[],
  scale: number,
  viewportHeight: number,
  scroller: RefObject<HTMLDivElement | null>,
): {
  readonly mode: ViewMode;
  readonly changeMode: (next: ViewMode) => void;
  readonly setPageIndex: (index: number) => void;
  readonly boxes: readonly PageBox[];
  /** The page being read, counting from zero. */
  readonly showing: number;
  readonly mounted: { readonly first: number; readonly last: number } | null;
  readonly stackHeight: number;
  readonly goTo: (index: number) => void;
  /** Reads the scroll offset after the document scrolled. */
  readonly track: () => void;
} {
  const [mode, setMode] = useState<ViewMode>("scroll");
  // Only consulted in page mode. In scroll mode the page being read is derived from the
  // scroll offset instead, so there is one source of truth per mode rather than two that
  // can disagree.
  const [pageIndex, setPageIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const boxes = stack(
    sizes.map((size) => size.height * scale),
    PAGE_GAP,
  );
  const lastPage = Math.max(0, sizes.length - 1);
  const showing =
    mode === "page"
      ? Math.min(pageIndex, lastPage)
      : currentIndex(boxes, scrollTop, viewportHeight);

  // One page mounted in page mode, the visible run plus its buffer in scroll mode.
  const mounted =
    mode === "page"
      ? sizes.length === 0
        ? null
        : { first: showing, last: showing }
      : renderWindow(boxes, scrollTop, viewportHeight);

  const shown = boxes[showing];
  const stackHeight =
    mode === "page" ? (shown?.height ?? 0) : totalHeight(boxes);

  const track = useCallback(() => {
    setScrollTop(scroller.current?.scrollTop ?? 0);
  }, [scroller]);

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

      const target = scrollTarget(boxes, wanted, showing);

      if (target !== null) {
        scroller.current?.scrollTo(target);
      }
    },
    [boxes, lastPage, mode, showing, scroller],
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
    [boxes, mode, showing, scroller],
  );

  return { mode, changeMode, setPageIndex, boxes, showing, mounted, stackHeight, goTo, track };
}
