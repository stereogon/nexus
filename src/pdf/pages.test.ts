/**
 * The viewer's arithmetic.
 *
 * Tested directly because there is no component harness in this repository
 * (`@testing-library/react` is an install, and §2 makes that the user's call), so anything
 * that lives inside a component is logic nothing checks. The off-by-one cases are the
 * point: a buffer that clamps wrongly at the ends shows a blank page at the top or bottom
 * of every document, which is the kind of bug that survives a demo.
 */
import { describe, expect, it } from "vitest";

import {
  PAGE_BUFFER,
  currentIndex,
  fitWidth,
  renderWindow,
  scrollTarget,
  stack,
  totalHeight,
} from "./pages";

/** Eighteen pages of 1000, 10 apart: the artboard's "4 / 18". */
const EIGHTEEN = stack(Array.from({ length: 18 }, () => 1000), 10);

describe("stacking pages", () => {
  it("places the first page at the top and the rest below it", () => {
    const boxes = stack([100, 200, 300], 10);

    expect(boxes).toEqual([
      { top: 0, height: 100 },
      { top: 110, height: 200 },
      { top: 320, height: 300 },
    ]);
  });

  it("stacks pages of differing heights, which a real document has", () => {
    // A deck with one landscape slide among portrait pages. Assuming a uniform height
    // would put every page after it in the wrong place.
    const boxes = stack([1000, 560, 1000], 0);

    expect(boxes[2]?.top).toBe(1560);
  });

  it("has no height and no pages when the document has none", () => {
    expect(stack([], 10)).toEqual([]);
    expect(totalHeight([])).toBe(0);
  });

  it("excludes the trailing gap from the total", () => {
    // Otherwise there is empty space under the last page that a person can scroll into.
    expect(totalHeight(stack([100, 100], 10))).toBe(210);
  });
});

describe("choosing what to render", () => {
  it("renders nothing at all for a document with no pages", () => {
    // `null` rather than an empty range, so no caller has to interpret `last < first`.
    expect(renderWindow([], 0, 800)).toBeNull();
  });

  it("renders the visible pages and the buffer below them", () => {
    const window = renderWindow(EIGHTEEN, 0, 800);

    expect(window).toEqual({ first: 0, last: 2 });
  });

  it("clamps the buffer at the top rather than going negative", () => {
    // A negative `first` would index nothing and render a blank first page.
    expect(renderWindow(EIGHTEEN, 0, 800, 5)?.first).toBe(0);
  });

  it("clamps the buffer at the bottom rather than running past the last page", () => {
    const end = totalHeight(EIGHTEEN);

    expect(renderWindow(EIGHTEEN, end - 800, 800, 5)?.last).toBe(17);
  });

  it("treats a page touching the fold as visible", () => {
    // Page 1 ends at 1000 and page 2 begins at 1010. A viewport ending exactly at 1010 is
    // about to show page 2, so rendering it is the point of having a buffer at all.
    const window = renderWindow(EIGHTEEN, 10, 1000, 0);

    expect(window).toEqual({ first: 0, last: 1 });
  });

  it("clamps a rubber-band overscroll to the first page", () => {
    // macOS reports a negative scrollTop during an elastic scroll. Without the clamp the
    // window would be empty and the first page would blank out as it bounced.
    expect(renderWindow(EIGHTEEN, -400, 800)).toEqual({ first: 0, last: 2 });
  });

  it("falls back to the last pages when scrolled beyond the end", () => {
    // Happens while heights are still being measured: the scroller is taller than the
    // pages it has so far. Showing the end is honest; showing nothing is a blank window.
    const window = renderWindow(EIGHTEEN, 999_999, 800);

    expect(window).toEqual({ first: 15, last: 17 });
  });

  it("still renders a page when the viewport has no height yet", () => {
    // First paint, before the container is measured. Rendering nothing here means the
    // viewer opens blank and only fills in if the person scrolls.
    expect(renderWindow(EIGHTEEN, 0, 0)).toEqual({ first: 0, last: 2 });
  });

  it("renders a window of the documented size in the middle of a document", () => {
    // Guards the spec's "visible pages + a 2-page buffer" against a change in `PAGE_BUFFER`
    // that nobody meant. At this offset page 5 begins exactly at the fold and is the only
    // one intersecting an 800-tall viewport, so the window is that page plus two either
    // side: five rendered out of eighteen.
    const window = renderWindow(EIGHTEEN, 5050, 800);

    expect(PAGE_BUFFER).toBe(2);
    expect(window).toEqual({ first: 3, last: 7 });
    expect((window?.last ?? 0) - (window?.first ?? 0) + 1).toBe(5);
  });
});

describe("the page the person is looking at", () => {
  it("is the first page at the top of the document", () => {
    expect(currentIndex(EIGHTEEN, 0, 800)).toBe(0);
  });

  it("is the page showing most of itself, not the one under the top edge", () => {
    // Scrolled so page 1 shows 100px and page 2 shows 690. Reading the top edge would say
    // page 1, which is the flicker every PDF reader gets wrong at some point.
    expect(currentIndex(EIGHTEEN, 900, 800)).toBe(1);
  });

  it("is the earlier page when two show exactly as much", () => {
    // Deterministic rather than whichever the loop saw last: a toolbar that alternates
    // between two numbers at one scroll position looks broken.
    const boxes = stack([1000, 1000], 0);

    expect(currentIndex(boxes, 500, 1000)).toBe(0);
  });

  it("is the first page for an empty viewport, not a crash", () => {
    expect(currentIndex(EIGHTEEN, 0, 0)).toBe(0);
    expect(currentIndex([], 0, 800)).toBe(0);
  });

  it("reaches the last page at the bottom", () => {
    expect(currentIndex(EIGHTEEN, totalHeight(EIGHTEEN) - 800, 800)).toBe(17);
  });

  it("is the last page when scrolled to the end, even with the last two both on screen", () => {
    const boxes = stack([400, 400, 400, 400], 20);
    const viewport = 900; // holds two whole pages

    expect(currentIndex(boxes, totalHeight(boxes) - viewport, viewport)).toBe(3);
    // One pixel short of the end is still "most visible, earlier on a tie".
    expect(currentIndex(boxes, totalHeight(boxes) - viewport - 40, viewport)).toBe(2);
  });
});

describe("fitting a page to the width", () => {
  const limits = { min: 0.25, max: 6 };

  it("scales a page to the space available", () => {
    expect(fitWidth(500, 1000, limits)).toBe(2);
  });

  it("does not magnify a tiny page past the limit", () => {
    expect(fitWidth(10, 1000, limits)).toBe(6);
  });

  it("does not shrink past the limit either", () => {
    expect(fitWidth(10_000, 100, limits)).toBe(0.25);
  });

  it("stays at 1 before the container has been laid out", () => {
    // A zero width would otherwise produce a scale of 0 and a canvas with no pixels.
    expect(fitWidth(500, 0, limits)).toBe(1);
    expect(fitWidth(0, 1000, limits)).toBe(1);
  });
});

describe("where to scroll to reach a page", () => {
  // The rule reported broken twice. Both times it sat inline in the viewer, where
  // reaching it meant rendering a PDF, so nothing checked the arithmetic.
  const BOXES = stack([800, 800, 800, 600, 800], 16);

  it("puts the page's top at the top of the scroller", () => {
    // `stack` measures from the top of the scroller, which is what `scrollTo` wants.
    expect(scrollTarget(BOXES, 2, 0)?.top).toBe(1632);
  });

  it("reaches the first page", () => {
    expect(scrollTarget(BOXES, 0, 3)?.top).toBe(0);
  });

  it("reaches the last page", () => {
    // 0, 816, 1632, 2448, then 2448 + 600 + 16: the fourth page is the short one, which
    // is exactly why the fixture has a short one.
    expect(scrollTarget(BOXES, 4, 0)?.top).toBe(3064);
  });

  it("has nowhere to go for a page the document does not have", () => {
    expect(scrollTarget(BOXES, 5, 0)).toBeNull();
    expect(scrollTarget(BOXES, -1, 0)).toBeNull();
  });

  it("has nowhere to go in an empty document", () => {
    expect(scrollTarget([], 0, 0)).toBeNull();
  });

  it("glides to a neighbouring page, where the movement is the feedback", () => {
    expect(scrollTarget(BOXES, 1, 0)?.behavior).toBe("smooth");
    expect(scrollTarget(BOXES, 2, 3)?.behavior).toBe("smooth");
  });

  it("jumps straight to a distant page", () => {
    // Animating the distance would render every page it passed on the way.
    expect(scrollTarget(BOXES, 4, 0)?.behavior).toBe("auto");
  });

  it("treats staying put as a glide rather than a jump", () => {
    expect(scrollTarget(BOXES, 2, 2)?.behavior).toBe("smooth");
  });
});
