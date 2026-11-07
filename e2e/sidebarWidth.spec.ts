/**
 * Setting how wide the sidebar is, with a divider at its edge as the notes have
 * (2026-11-07).
 */
import { expect, test, type Page } from "@playwright/test";

import { openNexus } from "./nexus";

const divider = (page: Page) => page.getByRole("separator", { name: "Sidebar width" });

async function width(page: Page, selector: string): Promise<number> {
  const found = await page.locator(selector).boundingBox();

  if (found === null) {
    throw new Error(`${selector} is not laid out.`);
  }

  return found.width;
}

/** Drags the divider by `by` pixels; positive is to the right, widening the sidebar. */
async function drag(page: Page, by: number): Promise<void> {
  const handle = await divider(page).boundingBox();

  if (handle === null) {
    throw new Error("The divider is not laid out.");
  }

  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by / 2, y, { steps: 4 });
  await page.mouse.move(x + by, y, { steps: 4 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  // No width of its own (its hit area is drawn around it), so present rather than visible.
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(divider(page)).toHaveCount(1);
});

test("dragging the divider widens the sidebar, and the pane beside it gives the room", async ({ page }) => {
  const before = await width(page, ".sidebar");
  const paneBefore = await width(page, ".pane");

  await drag(page, 100);

  expect(Math.abs((await width(page, ".sidebar")) - (before + 100))).toBeLessThanOrEqual(1);
  expect(Math.abs((await width(page, ".pane")) - (paneBefore - 100))).toBeLessThanOrEqual(1);
});

test("the sidebar stops at its narrowest and its widest", async ({ page }) => {
  // The window is wide enough that the widest is the sidebar's own, not the panes' room.
  await drag(page, -500);
  expect(Math.abs((await width(page, ".sidebar")) - 200)).toBeLessThanOrEqual(1);

  await drag(page, 1500);
  expect(Math.abs((await width(page, ".sidebar")) - 480)).toBeLessThanOrEqual(1);
});

test("the arrow keys move it, and the width survives hiding the sidebar", async ({ page }) => {
  const before = await width(page, ".sidebar");

  await divider(page).focus();
  await page.keyboard.press("Shift+ArrowRight");
  expect(Math.abs((await width(page, ".sidebar")) - (before + 64))).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(divider(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Show sidebar" }).click();

  expect(Math.abs((await width(page, ".sidebar")) - (before + 64))).toBeLessThanOrEqual(1);
});
