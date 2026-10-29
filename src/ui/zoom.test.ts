/**
 * Stepping through the zoom levels.
 *
 * Only testable at all because it moved out of the component; while it lived inside
 * `PdfViewer` the only way to exercise it was to render a PDF.
 */
import { describe, expect, it } from "vitest";

import { stepFrom, ZOOM_LIMITS, ZOOM_STEPS } from "./zoom";

describe("stepping up", () => {
  it("goes to the next step", () => {
    expect(stepFrom(1, 1)).toBe(1.25);
    expect(stepFrom(0.5, 1)).toBe(0.75);
  });

  it("stops at the top rather than running past it", () => {
    expect(stepFrom(6, 1)).toBe(6);
  });

  it("moves off a fitted scale that is a hair under a step", () => {
    // A fitted scale is whatever the pane's width made it, so it almost never lands on a
    // step. Without the tolerance, `+` from 0.9999 returns 1 and the button looks dead.
    expect(stepFrom(0.9999, 1)).toBe(1.25);
  });

  it("climbs from an odd fitted scale to the next round one", () => {
    expect(stepFrom(1.37, 1)).toBe(1.5);
  });
});

describe("stepping down", () => {
  it("goes to the previous step", () => {
    expect(stepFrom(1.25, -1)).toBe(1);
    expect(stepFrom(6, -1)).toBe(4);
  });

  it("stops at the bottom", () => {
    expect(stepFrom(0.5, -1)).toBe(0.5);
  });

  it("drops from an odd fitted scale to the next round one below", () => {
    expect(stepFrom(1.37, -1)).toBe(1.25);
  });
});

describe("the steps themselves", () => {
  it("are in increasing order, which the search relies on", () => {
    expect([...ZOOM_STEPS]).toEqual([...ZOOM_STEPS].sort((a, b) => a - b));
  });

  it("stay inside the limits the toolbar enforces", () => {
    for (const step of ZOOM_STEPS) {
      expect(step).toBeGreaterThanOrEqual(ZOOM_LIMITS.min);
      expect(step).toBeLessThanOrEqual(ZOOM_LIMITS.max);
    }
  });

  it("include 100%, since that is the one people look for", () => {
    expect(ZOOM_STEPS).toContain(1);
  });
});
