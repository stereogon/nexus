/**
 * Turning a drag into an area highlight's region.
 */
import { describe, expect, it } from "vitest";

import { outlineOn } from "../ui/useAreaDraw";
import { areaIn, boxBetween, MIN_AREA_SIDE } from "./area";

const PAGE = { left: 100, top: 50, width: 1000, height: 500 };

describe("the box between two points", () => {
  it("is the same whichever corner the drag started from", () => {
    // Dragging up and to the left is as ordinary as down and to the right.
    const forwards = boxBetween({ x: 200, y: 100 }, { x: 400, y: 300 });
    const backwards = boxBetween({ x: 400, y: 300 }, { x: 200, y: 100 });

    expect(forwards).toEqual({ left: 200, top: 100, width: 200, height: 200 });
    expect(backwards).toEqual(forwards);
  });
});

describe("the region a box covers", () => {
  it("is normalised against the page, wherever the page sits on screen", () => {
    const region = areaIn({ left: 300, top: 150, width: 500, height: 200 }, PAGE);

    expect(region?.x).toBeCloseTo(0.2, 10);
    expect(region?.y).toBeCloseTo(0.2, 10);
    expect(region?.width).toBeCloseTo(0.5, 10);
    expect(region?.height).toBeCloseTo(0.4, 10);
  });

  it("is nothing for a stray Option-click", () => {
    expect(areaIn({ left: 300, top: 150, width: 3, height: 2 }, PAGE)).toBeNull();
  });

  it("is nothing for a box too thin in either direction", () => {
    // A box must be big enough to see and to click the badge of, on both sides.
    expect(areaIn({ left: 300, top: 150, width: 400, height: MIN_AREA_SIDE - 1 }, PAGE)).toBeNull();
    expect(areaIn({ left: 300, top: 150, width: MIN_AREA_SIDE - 1, height: 400 }, PAGE)).toBeNull();
  });

  it("keeps the part on the page when the drag runs off its edge", () => {
    // Dragging slightly past a diagram in the corner of a slide is ordinary.
    const region = areaIn({ left: 900, top: 400, width: 400, height: 300 }, PAGE);

    expect(region).not.toBeNull();
    expect((region?.x ?? 0) + (region?.width ?? 0)).toBeCloseTo(1, 10);
    expect((region?.y ?? 0) + (region?.height ?? 0)).toBeCloseTo(1, 10);
  });

  it("is nothing for a box drawn entirely off the page", () => {
    expect(areaIn({ left: 1200, top: 50, width: 100, height: 100 }, PAGE)).toBeNull();
  });
});

describe("the outline shown on a page", () => {
  const REGION = { x: 0.1, y: 0.1, width: 0.3, height: 0.2 };
  const WAITING = { pageIndex: 2, region: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 } };

  it("follows the box being drawn on that page", () => {
    expect(outlineOn(1, { pageIndex: 1, region: REGION }, null)).toBe(REGION);
  });

  it("shows the box waiting for a meaning once the drag has ended", () => {
    expect(outlineOn(2, null, WAITING)).toBe(WAITING.region);
  });

  it("prefers the box being drawn over one waiting on the same page", () => {
    expect(outlineOn(2, { pageIndex: 2, region: REGION }, WAITING)).toBe(REGION);
  });

  it("shows nothing on any other page", () => {
    expect(outlineOn(0, { pageIndex: 1, region: REGION }, WAITING)).toBeNull();
  });
});
