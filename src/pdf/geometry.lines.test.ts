/**
 * Turning a browser selection into the lines that get stored.
 *
 * Split from `geometry.test.ts` on 2026-10-29, which had grown past the 300-line limit in
 * `CLAUDE.md` §4. The seam is the one the suite already had: that file is about
 * normalising *one* rectangle and round-tripping it, while this is about what a selection
 * -- many rectangles, some of them the layout's own furniture -- collapses into.
 */
import { describe, expect, it } from "vitest";

import { expectRect } from "./expectRect";
import { lineRects, type PixelRect } from "./geometry";

describe("collapsing a selection into lines", () => {
  const page: PixelRect = { left: 0, top: 0, width: 1000, height: 1000 };

  it("joins the fragments of one line into one rectangle", () => {
    // A sentence crossing three spans arrives as three rects. Drawn separately they show
    // seams; Rust's TextHighlight wants one rectangle per line.
    const rects = lineRects(
      [
        { left: 100, top: 200, width: 150, height: 20 },
        { left: 250, top: 200, width: 100, height: 20 },
        { left: 350, top: 200, width: 50, height: 20 },
      ],
      page,
    );

    expect(rects).toHaveLength(1);
    expectRect(rects[0] ?? null, { x: 0.1, y: 0.2, width: 0.3, height: 0.02 });
  });

  it("keeps separate lines separate", () => {
    const rects = lineRects(
      [
        { left: 100, top: 200, width: 200, height: 20 },
        { left: 100, top: 230, width: 150, height: 20 },
      ],
      page,
    );

    expect(rects).toHaveLength(2);
    expect(rects[0]?.y).toBeCloseTo(0.2, 10);
    expect(rects[1]?.y).toBeCloseTo(0.23, 10);
  });

  it("treats a mixed-size line as one line", () => {
    // A superscript or an inline formula sits higher and is shorter than the text around
    // it. Grouping by matching tops would split the line and draw a notch in the
    // highlight, so the grouping is by vertical overlap instead.
    const rects = lineRects(
      [
        { left: 100, top: 200, width: 100, height: 20 },
        { left: 200, top: 196, width: 12, height: 11 },
        { left: 212, top: 200, width: 80, height: 20 },
      ],
      page,
    );

    expect(rects).toHaveLength(1);
    expect(rects[0]?.height).toBeCloseTo(0.024, 10);
  });

  it("merges a nested span's duplicate rectangle instead of double-darkening it", () => {
    const rects = lineRects(
      [
        { left: 100, top: 200, width: 300, height: 20 },
        { left: 150, top: 200, width: 100, height: 20 },
      ],
      page,
    );

    expect(rects).toHaveLength(1);
    expectRect(rects[0] ?? null, { x: 0.1, y: 0.2, width: 0.3, height: 0.02 });
  });

  it("reads top to bottom however the selection was dragged", () => {
    // A backwards drag reports its rects in the other order. The stored rectangles should
    // not record which way the mouse moved.
    const forwards = lineRects(
      [
        { left: 100, top: 100, width: 200, height: 20 },
        { left: 100, top: 140, width: 200, height: 20 },
      ],
      page,
    );
    const backwards = lineRects(
      [
        { left: 100, top: 140, width: 200, height: 20 },
        { left: 100, top: 100, width: 200, height: 20 },
      ],
      page,
    );

    expect(backwards).toEqual(forwards);
  });

  it("ignores the empty rectangles a line break reports", () => {
    const rects = lineRects(
      [
        { left: 100, top: 200, width: 200, height: 20 },
        { left: 300, top: 200, width: 0, height: 20 },
        { left: 100, top: 240, width: 0, height: 0 },
      ],
      page,
    );

    expect(rects).toHaveLength(1);
  });

  it("returns nothing for a selection of nothing", () => {
    expect(lineRects([], page)).toEqual([]);
  });

  it("leaves the browser's own rect list alone", () => {
    // `getClientRects()` hands back a live list; sorting it in place would be a side
    // effect on the DOM's own data.
    const given: PixelRect[] = [
      { left: 100, top: 300, width: 10, height: 10 },
      { left: 100, top: 100, width: 10, height: 10 },
    ];

    lineRects(given, page);

    expect(given[0]?.top).toBe(300);
  });
});

describe("the foot of the pdf.js text layer", () => {
  // The rectangle behind the reported badge bug: full width, pinned to the bottom of the
  // page, and a hair above zero high rather than exactly zero -- so a `> 0` test kept it.
  const PAGE = { left: 0, top: 0, width: 1000, height: 800 };

  it("is dropped rather than stored as a line", () => {
    // A hair *above* the bottom, not on it. Sitting exactly on the page edge, both of its
    // vertical edges clamp to 1, so it normalises to zero height and `SMALLEST_SIDE`
    // already removes it -- a fixture written that way passes whether this filter exists
    // or not, which is how the first version of this test fooled itself.
    const foot = { left: 0, top: 799.9, width: 1000, height: 0.1 };
    const line = { left: 230, top: 288, width: 60, height: 24 };

    expect(lineRects([line, foot], PAGE)).toHaveLength(1);
  });

  it("would otherwise survive the rule that keeps float noise out of a file", () => {
    // Why this filter is needed at all: `SMALLEST_SIDE` is one part in a hundred thousand
    // of a page, and the foot is two parts in ten thousand -- comfortably past it.
    const foot = { left: 0, top: 799.9, width: 1000, height: 0.1 };
    const [stored] = lineRects([foot], PAGE);

    expect(stored).toBeUndefined();
  });

  it("keeps a short but real line", () => {
    // The threshold has to let through the smallest thing a person could be reading. A
    // line one pixel tall is already past the point of legibility.
    const small = { left: 100, top: 100, width: 40, height: 1 };

    expect(lineRects([small], PAGE)).toHaveLength(1);
  });

  it("keeps ordinary text untouched", () => {
    const line = { left: 230, top: 288, width: 60, height: 24 };
    const [only] = lineRects([line], PAGE);

    expectRect(only ?? null, { x: 0.23, y: 0.36, width: 0.06, height: 0.03 });
  });
});
