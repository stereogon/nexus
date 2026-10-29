/**
 * Keeping the menu inside the window.
 *
 * Every case here is an edge that is tedious to arrange in a browser and trivial to write
 * down, which is the whole reason `placeMenu` takes the viewport as an argument instead of
 * reading `window`.
 */
import { describe, expect, it } from "vitest";

import { placeMenu } from "./menuPlacement";

const MENU = { width: 140, height: 34 };
const WINDOW = { width: 1440, height: 900 };

/** An anchor on a line 20px tall, `left` across and `top` down. */
function anchor(left: number, lineTop: number) {
  return { left, top: lineTop + 28, above: lineTop - 8 };
}

describe("horizontally", () => {
  it("leaves a menu with room where it asked to be", () => {
    expect(placeMenu(anchor(300, 400), MENU, WINDOW).left).toBe(300);
  });

  it("slides a menu at the right margin back into view", () => {
    // The reported bug: a highlight near the right edge opened its menu off the screen,
    // so Remove could not be reached at all.
    const placed = placeMenu(anchor(1400, 400), MENU, WINDOW);

    expect(placed.left).toBe(1440 - 140 - 8);
    expect(placed.left + MENU.width).toBeLessThanOrEqual(WINDOW.width);
  });

  it("slides it exactly as far as it needs to and no further", () => {
    // One pixel over should move by one pixel, not jump to the margin.
    expect(placeMenu(anchor(1293, 400), MENU, WINDOW).left).toBe(1292);
  });

  it("keeps a menu off the left edge too", () => {
    expect(placeMenu(anchor(-50, 400), MENU, WINDOW).left).toBe(8);
  });

  it("pins a menu wider than the window rather than placing it negatively", () => {
    const placed = placeMenu(anchor(500, 400), { width: 2000, height: 34 }, WINDOW);

    expect(placed.left).toBe(8);
  });
});

describe("vertically", () => {
  it("sits below the line when there is room", () => {
    expect(placeMenu(anchor(300, 400), MENU, WINDOW).top).toBe(428);
  });

  it("flips above the line near the bottom of the window", () => {
    // Flipped rather than slid up: sliding would park the menu over the very text it
    // belongs to, which is the one place it must not be.
    const lineTop = 880;
    const placed = placeMenu(anchor(300, lineTop), MENU, WINDOW);

    expect(placed.top).toBe(lineTop - 8 - MENU.height);
    expect(placed.top + MENU.height).toBeLessThan(lineTop);
  });

  it("does not flip off the top for a selection on the first line", () => {
    // No room either way. Covering the text below is better than being cut off by the
    // top of the window, where there is nothing to drag it back.
    const placed = placeMenu(anchor(300, 2), { width: 140, height: 400 }, { width: 1440, height: 420 });

    expect(placed.top).toBeGreaterThanOrEqual(8);
  });

  it("keeps a tall menu inside a short window", () => {
    const placed = placeMenu(anchor(300, 100), { width: 140, height: 300 }, { width: 1440, height: 320 });

    expect(placed.top).toBeGreaterThanOrEqual(8);
  });
});

describe("the margin", () => {
  it("is honoured on every side", () => {
    const placed = placeMenu(anchor(5000, 5000), MENU, WINDOW, 16);

    expect(placed.left).toBe(1440 - 140 - 16);
    expect(placed.top).toBeLessThanOrEqual(900 - MENU.height - 16);
  });
});
