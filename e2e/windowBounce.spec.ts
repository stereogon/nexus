/**
 * The window never scrolls or bounces as a whole (2026-11-09): only the panes inside it do.
 * A real trackpad's elastic bounce cannot be produced in the test browser, so this checks
 * what turns it off — the root's `overscroll-behavior` — and that wheeling anywhere moves
 * only the panes.
 */
import { expect, test } from "@playwright/test";

import { READING } from "./fixture";
import { openLecture, openNexus } from "./nexus";

test("the window neither scrolls nor bounces; the panes scroll inside it", async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
  await expect(page.getByLabel("Page 1", { exact: true })).toBeVisible();

  const root = await page.evaluate(() =>
    [document.documentElement, document.body].map((element) => {
      const style = getComputedStyle(element);

      return `${style.overscrollBehaviorY} ${style.overflowY}`;
    }),
  );

  expect(root).toEqual(["none hidden", "none hidden"]);

  const size = page.viewportSize();

  for (let x = 30; x < (size?.width ?? 0); x += 150) {
    for (let y = 30; y < (size?.height ?? 0); y += 150) {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 600);
    }
  }

  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? -1)).toBe(0);
  expect(await page.locator(".viewer-bed").evaluate((bed) => bed.scrollTop)).toBeGreaterThan(0);
});
