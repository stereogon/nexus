/**
 * The rules a selection has to satisfy to become a highlight.
 *
 * Pure, so they run in Node: every one of these is about which rectangles belong to the
 * page and what makes a selection unstorable. Where a highlight actually *lands* is not
 * testable here — jsdom reports every rectangle as zero — and is unverified until the
 * browser suite exists.
 */
import { describe, expect, it } from "vitest";

import { candidateIn, withinPage } from "./selection";

/** A page sitting partway down the viewport, so page-relative and viewport differ. */
const PAGE = { left: 100, top: 50, width: 800, height: 1000 };

/** A line of text on that page, `from` pixels down from the page's top. */
function line(from: number, left = 100, width = 400) {
  return { left: PAGE.left + left, top: PAGE.top + from, width, height: 20 };
}

describe("which rectangles belong to the page", () => {
  it("keeps a line sitting on it", () => {
    expect(withinPage([line(300)], PAGE)).toHaveLength(1);
  });

  it("drops a line below it, which is the next page's", () => {
    // A selection dragged past the bottom carries on into the next page and the browser
    // reports rects for both. Normalising those against this page would place them
    // somewhere plausible and wrong, because `normalise` clamps rather than rejects.
    expect(withinPage([{ ...line(0), top: PAGE.top + 1400 }], PAGE)).toEqual([]);
  });

  it("keeps a line straddling the bottom edge, if it mostly sits on this page", () => {
    // Judged on the centre, so a line overhanging by a pixel is not dropped from both
    // pages and lost.
    const straddling = { ...line(0), top: PAGE.top + 990, height: 20 };

    expect(withinPage([straddling], PAGE)).toHaveLength(1);
  });

  it("drops a line that mostly sits on the next page", () => {
    const over = { ...line(0), top: PAGE.top + 1005, height: 20 };

    expect(withinPage([over], PAGE)).toEqual([]);
  });

  it("keeps a line right at the top edge", () => {
    expect(withinPage([{ ...line(0), top: PAGE.top, height: 20 }], PAGE)).toHaveLength(1);
  });
});

describe("assembling a candidate", () => {
  it("normalises one line against the unscaled page", () => {
    const made = candidateIn(3, [line(250, 80, 400)], PAGE, "a quorum is a majority");

    expect(made?.pageIndex).toBe(3);
    expect(made?.rects).toHaveLength(1);
    expect(made?.rects[0]?.x).toBeCloseTo(80 / 800, 10);
    expect(made?.rects[0]?.y).toBeCloseTo(250 / 1000, 10);
    expect(made?.rects[0]?.width).toBeCloseTo(400 / 800, 10);
  });

  it("gives one rectangle per line of a wrapped selection", () => {
    const made = candidateIn(0, [line(250), line(275)], PAGE, "two lines");

    expect(made?.rects).toHaveLength(2);
  });

  it("merges the fragments of one line into a single rectangle", () => {
    // A sentence crossing three spans arrives as three rects. Drawing those directly
    // gives a highlight with visible seams, so they collapse into one.
    const made = candidateIn(
      0,
      [line(250, 100, 100), line(250, 200, 100), line(250, 300, 100)],
      PAGE,
      "one line in three spans",
    );

    expect(made?.rects).toHaveLength(1);
    expect(made?.rects[0]?.width).toBeCloseTo(300 / 800, 10);
  });

  it("orders the lines top to bottom however the selection was dragged", () => {
    const made = candidateIn(0, [line(600), line(250)], PAGE, "dragged upwards");
    const tops = made?.rects.map((rect) => rect.y) ?? [];

    expect(tops).toEqual([...tops].sort((a, b) => a - b));
  });

  it("trims the quote", () => {
    const made = candidateIn(0, [line(250)], PAGE, "  a quorum  \n");

    expect(made?.quote).toBe("a quorum");
  });

  it("refuses a selection with no text", () => {
    expect(candidateIn(0, [line(250)], PAGE, "   ")).toBeNull();
    expect(candidateIn(0, [line(250)], PAGE, "")).toBeNull();
  });

  it("refuses a selection with no rectangle left on the page", () => {
    // Rust refuses a text highlight covering nothing, so offering a menu for one would
    // mean offering something that fails the moment it is chosen.
    expect(candidateIn(0, [], PAGE, "words")).toBeNull();
    expect(
      candidateIn(0, [{ ...line(0), top: PAGE.top + 2000 }], PAGE, "next page"),
    ).toBeNull();
  });

  it("refuses a sliver too small to see or click", () => {
    const hairline = { left: PAGE.left, top: PAGE.top + 10, width: 0.000_01, height: 20 };

    expect(candidateIn(0, [hairline], PAGE, "a line break")).toBeNull();
  });
});
