/**
 * Sticky notes' geometry: where a new one goes, and that dragging keeps it on the page.
 */
import { describe, expect, it } from "vitest";

import { movedBy, resizedBy, STICKY_MIN, STICKY_SIZE, stickyBeside } from "./sticky";

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
