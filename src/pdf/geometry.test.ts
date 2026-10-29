import { describe, expect, it } from "vitest";

import {
  bounding,
  denormalise,
  normalise,
  type NormalizedRect,
  type PixelRect,
} from "./geometry";
import { expectRect } from "./expectRect";

/** An A4 page as rendered at some zoom, placed somewhere on screen. */
function pageAt(scale: number, left = 120, top = 40): PixelRect {
  return { left, top, width: 595 * scale, height: 842 * scale };
}

/** The four zoom levels the milestone names. */
const ZOOMS = [0.5, 1, 1.75, 3];


describe("normalising one rectangle", () => {
  it("places a rectangle as fractions of the page, not pixels", () => {
    const page: PixelRect = { left: 100, top: 50, width: 400, height: 800 };
    const rect = normalise({ left: 200, top: 250, width: 100, height: 400 }, page);

    expect(rect).toEqual({ x: 0.25, y: 0.25, width: 0.25, height: 0.5 });
  });

  it("gives the same numbers at every zoom, which is the whole point", () => {
    // §3: the coordinates are against the unscaled page, so the zoom has to divide out.
    // A highlight made at 300% must be the same stored rectangle as one made at 50%, or
    // it lands somewhere else when reopened -- or on the iPad, at a third size.
    const made: NormalizedRect[] = [];

    for (const scale of ZOOMS) {
      const page = pageAt(scale);
      // The same quarter of the page, expressed in that zoom's pixels.
      const box = {
        left: page.left + page.width * 0.1,
        top: page.top + page.height * 0.2,
        width: page.width * 0.3,
        height: page.height * 0.05,
      };
      const rect = normalise(box, page);

      expect(rect).not.toBeNull();
      made.push(rect as NormalizedRect);
    }

    for (const rect of made) {
      expect(rect.x).toBeCloseTo(0.1, 10);
      expect(rect.y).toBeCloseTo(0.2, 10);
      expect(rect.width).toBeCloseTo(0.3, 10);
      expect(rect.height).toBeCloseTo(0.05, 10);
    }
  });

  it("survives a round trip through pixels at every zoom", () => {
    const original: NormalizedRect = {
      x: 0.137,
      y: 0.4021,
      width: 0.5533,
      height: 0.0218,
    };

    for (const scale of ZOOMS) {
      const page = pageAt(scale);
      const returned = normalise(denormalise(original, page), page);

      expect(returned).not.toBeNull();
      expect(returned?.x).toBeCloseTo(original.x, 9);
      expect(returned?.y).toBeCloseTo(original.y, 9);
      expect(returned?.width).toBeCloseTo(original.width, 9);
      expect(returned?.height).toBeCloseTo(original.height, 9);
    }
  });

  it("keeps the part of a rectangle that is on the page", () => {
    // A span can report a rect hanging over the margin. Clamping each edge on its own
    // keeps the visible part rather than discarding a real selection.
    const page: PixelRect = { left: 0, top: 0, width: 100, height: 100 };
    const rect = normalise({ left: 80, top: 10, width: 60, height: 10 }, page);

    expectRect(rect, { x: 0.8, y: 0.1, width: 0.2, height: 0.1 });
  });

  it("never returns a rectangle Rust would refuse", () => {
    // The exact rules in `NormalizedRect::new`: inside [0,1], strictly positive sides, and
    // not extending past the right or bottom edge. Checked here so a selection cannot
    // reach the boundary and fail there.
    const page: PixelRect = { left: 0, top: 0, width: 200, height: 200 };
    const awkward: PixelRect[] = [
      { left: -500, top: -500, width: 2000, height: 2000 },
      { left: 199.999, top: 0, width: 50, height: 50 },
      { left: 0, top: 199.9999, width: 10, height: 90 },
      { left: 150, top: 150, width: 100, height: 100 },
    ];

    for (const box of awkward) {
      const rect = normalise(box, page);

      if (rect !== null) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(1);
        expect(rect.y + rect.height).toBeLessThanOrEqual(1);
      }
    }
  });

  it("drops a sliver rather than storing something nobody can click", () => {
    const page: PixelRect = { left: 0, top: 0, width: 1000, height: 1000 };

    expect(normalise({ left: 10, top: 10, width: 0, height: 20 }, page)).toBeNull();
    expect(normalise({ left: 10, top: 10, width: 20, height: 0 }, page)).toBeNull();
    // Positive, but one part in a billion of the page: Rust would accept it and no cursor
    // could ever find it again.
    expect(normalise({ left: 10, top: 10, width: 1e-6, height: 20 }, page)).toBeNull();
  });

  it("refuses a page with no size, which is the first paint", () => {
    const nothing: PixelRect = { left: 0, top: 0, width: 0, height: 0 };

    expect(normalise({ left: 0, top: 0, width: 10, height: 10 }, nothing)).toBeNull();
  });

  it("refuses values that are not numbers", () => {
    const page: PixelRect = { left: 0, top: 0, width: 100, height: 100 };

    expect(normalise({ left: NaN, top: 0, width: 10, height: 10 }, page)).toBeNull();
    expect(
      normalise({ left: 0, top: 0, width: Infinity, height: 10 }, page),
    ).toBeNull();
  });
});

describe("the bounding rectangle", () => {
  it("covers every rectangle given", () => {
    expectRect(
      bounding([
        { x: 0.2, y: 0.1, width: 0.3, height: 0.05 },
        { x: 0.1, y: 0.3, width: 0.2, height: 0.05 },
      ]),
      { x: 0.1, y: 0.1, width: 0.4, height: 0.25 },
    );
  });

  it("is a single rectangle unchanged", () => {
    const only = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

    expectRect(bounding([only]), only);
  });

  it("is nothing for no rectangles, rather than a zero-area rectangle", () => {
    // Matching Rust, where `bounding` of an empty slice is an error: there is no such
    // thing as the bounding box of nothing, and a zero rectangle would be a lie.
    expect(bounding([])).toBeNull();
  });
});

