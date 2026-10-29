/**
 * Comparing normalised rectangles in tests.
 *
 * Shared by the two halves of the geometry suite rather than copied into each. It encodes
 * a decision -- how much floating-point difference is noise -- and a decision in two
 * places is a decision that will eventually be made twice, differently.
 */
import { expect } from "vitest";

import type { NormalizedRect } from "./geometry";

/**
 * Compares two rectangles component by component, to ten decimal places.
 *
 * Exact equality is the wrong tool here: these numbers come out of divisions and
 * subtractions, so `0.4 - 0.1` is `0.30000000000000004` and a correct result fails a
 * `toEqual`. Ten places is far finer than any page dimension and far coarser than the
 * noise.
 */
export function expectRect(actual: NormalizedRect | null, expected: NormalizedRect): void {
  expect(actual).not.toBeNull();
  expect(actual?.x).toBeCloseTo(expected.x, 10);
  expect(actual?.y).toBeCloseTo(expected.y, 10);
  expect(actual?.width).toBeCloseTo(expected.width, 10);
  expect(actual?.height).toBeCloseTo(expected.height, 10);
}
