/**
 * Sticky notes' geometry: where a new one goes, and that dragging keeps it on the page.
 */
import { describe, expect, it } from "vitest";

import { legible, movedBy, resizedBy, STICKY_LEGIBLE, STICKY_MIN, STICKY_SIZE, stickyBeside } from "./sticky";

const onPage = (r: { x: number; y: number; width: number; height: number }) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= 1 + 1e-9 && r.y + r.height <= 1 + 1e-9;

describe("a new note", () => {
  it("goes to the right of its highlight, at the same height", () => {
    const note = stickyBeside({ x: 0.1, y: 0.3, width: 0.3, height: 0.05 });

    expect(note.x).toBeGreaterThan(0.4);
    expect(note.y).toBeCloseTo(0.3, 10);
    expect(note).toMatchObject(STICKY_SIZE);
  });

  it("goes to the left when the highlight runs to the right margin", () => {
    const note = stickyBeside({ x: 0.6, y: 0.3, width: 0.38, height: 0.05 });

    expect(note.x + note.width).toBeLessThan(0.6);
    expect(onPage(note)).toBe(true);
  });

  it("goes below when the highlight spans the page", () => {
    const note = stickyBeside({ x: 0.05, y: 0.3, width: 0.9, height: 0.05 });

    expect(note.y).toBeGreaterThan(0.35);
    expect(onPage(note)).toBe(true);
  });

  it("stays on the page for a highlight at the very bottom", () => {
    expect(onPage(stickyBeside({ x: 0.05, y: 0.95, width: 0.9, height: 0.04 }))).toBe(true);
  });
});

describe("dragging a note", () => {
  const NOTE = { x: 0.5, y: 0.5, ...STICKY_SIZE };

  it("moves it by the distance dragged", () => {
    expect(movedBy(NOTE, 0.1, -0.2)).toMatchObject({ x: 0.6, y: 0.3 });
  });

  it("stops it at the page's edges rather than losing it off them", () => {
    expect(onPage(movedBy(NOTE, 5, 5))).toBe(true);
    expect(movedBy(NOTE, -5, -5)).toMatchObject({ x: 0, y: 0 });
  });
});

describe("resizing a note", () => {
  const NOTE = { x: 0.5, y: 0.5, ...STICKY_SIZE };

  it("grows it from its corner", () => {
    expect(resizedBy(NOTE, 0.1, 0.05).width).toBeCloseTo(0.34, 10);
  });

  it("never makes it too small to grab or read", () => {
    expect(resizedBy(NOTE, -1, -1)).toMatchObject(STICKY_MIN);
  });

  it("never lets it grow past the page", () => {
    expect(onPage(resizedBy(NOTE, 5, 5))).toBe(true);
  });
});

describe("the room left after a highlight", () => {
  it("is as much as the caller asks, to keep the badge uncovered", () => {
    // A note placed closer covered the highlight's badge — the only way to its menu.
    const highlight = { x: 0.1, y: 0.3, width: 0.3, height: 0.05 };
    const roomy = stickyBeside(highlight, STICKY_SIZE, 0.06);

    expect(roomy.x).toBeCloseTo(0.46, 10);
  });
});

describe("drawing a note legibly", () => {
  // A wide, short slide at a small zoom: the default note came to about 130 × 45 pixels.
  const SMALL = { width: 560, height: 315 };
  const LARGE = { width: 2000, height: 1125 };

  it("is never smaller on screen than its buttons and a few lines need", () => {
    const drawn = legible({ x: 0.3, y: 0.2, ...STICKY_SIZE }, SMALL);

    expect(drawn.width * SMALL.width).toBeCloseTo(STICKY_LEGIBLE.width);
    expect(drawn.height * SMALL.height).toBeCloseTo(STICKY_LEGIBLE.height);
  });

  it("leaves a note that is already large enough as it is", () => {
    const region = { x: 0.3, y: 0.2, ...STICKY_SIZE };

    expect(legible(region, LARGE)).toEqual(region);
  });

  it("moves in from the edge as far as its larger size needs, staying on the page", () => {
    const drawn = legible({ x: 0.9, y: 0.9, ...STICKY_SIZE }, SMALL);

    expect(drawn.x + drawn.width).toBeCloseTo(1);
    expect(drawn.y + drawn.height).toBeCloseTo(1);
  });

  it("fills a page too small for it rather than overflowing it", () => {
    expect(legible({ x: 0.5, y: 0.5, ...STICKY_SIZE }, { width: 150, height: 80 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it("draws as stored before the page has a size", () => {
    const region = { x: 0.3, y: 0.2, ...STICKY_SIZE };

    expect(legible(region, { width: 0, height: 0 })).toEqual(region);
  });
});
