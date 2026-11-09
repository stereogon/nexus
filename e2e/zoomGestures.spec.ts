/**
 * Zooming a document without the buttons (2026-11-09): ⌘+ and ⌘−, Ctrl with the scroll
 * wheel, and a trackpad pinch.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const percent = async (page: Page) => Number((await page.locator(".viewer-scale").textContent())?.replace("%", ""));

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
  await expect(page.getByLabel("Page 1", { exact: true })).toBeVisible();
});

test("⌘= and ⌘− step through the zoom, as + and − do", async ({ page }) => {
  await page.getByRole("button", { name: "Zoom in" }).click();
  const start = await percent(page);

  await page.keyboard.press("Meta+=");
  await expect.poll(() => percent(page)).toBeGreaterThan(start);

  await page.keyboard.press("Meta+-");
  await page.keyboard.press("Meta+-");
  await expect.poll(() => percent(page)).toBeLessThan(start);
});

test("Ctrl and the scroll wheel zoom in and out over the page", async ({ page }) => {
  const start = await percent(page);
  const box = await page.locator(".viewer-bed").boundingBox();

  await page.mouse.move((box?.x ?? 0) + 200, (box?.y ?? 0) + 200);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");

  await expect.poll(() => percent(page)).toBeGreaterThan(start);
});

test("a trackpad pinch zooms by more than the fingers spread", async ({ page }) => {
  const start = await percent(page);

  await page.locator(".viewer-bed").evaluate((bed) => {
    const gesture = (type: string, scale: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });

      Object.defineProperty(event, "scale", { value: scale });
      bed.dispatchEvent(event);
    };

    gesture("gesturestart", 1);
    gesture("gesturechange", 2);
    gesture("gestureend", 2);
  });

  // Twice the spread zooms by 2^1.5, within the rounding of the percentage it started from.
  await expect.poll(async () => Math.abs((await percent(page)) - start * 2 ** 1.5)).toBeLessThanOrEqual(2);
});
