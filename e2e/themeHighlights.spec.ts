/**
 * Highlight colours follow the theme (2026-11-07): a theme whose accent would clash with a
 * highlight swaps that colour — Sky's blue accent gives "question" a violet — and the
 * standard colours come back with a theme that swaps nothing.
 */
import { expect, test, type Page } from "@playwright/test";

import type { Annotation } from "../src/ipc/annotations";
import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const QUESTION: Annotation = {
  kind: "textHighlight",
  id: "hl-question",
  page: 1,
  semantic: "question",
  quote: "A question",
  rects: [{ x: 0.05, y: 0.3, width: 0.4, height: 0.06 }],
  createdAt: "2026-11-07T09:00:00.000Z",
  updatedAt: "2026-11-07T09:00:00.000Z",
};

const settings = (page: Page) => page.getByRole("dialog", { name: "Settings" });
const washOf = (page: Page) =>
  page.locator('.highlight[data-semantic="question"]').first().evaluate((element) => getComputedStyle(element).backgroundColor);

test("a question highlight turns violet in Sky, and blue again in Paper", async ({ page }) => {
  await openNexus(page, { ...standardFixture(), annotations: { [READING.directory]: [QUESTION] } });
  await openLecture(page, READING.title);
  await expect(page.locator('.highlight[data-semantic="question"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Settings" }).click();
  await settings(page).getByRole("radio", { name: /Sky/u }).click();
  await expect.poll(() => washOf(page)).toBe("rgba(118, 80, 216, 0.24)");

  await settings(page).getByRole("radio", { name: /Paper/u }).click();
  await expect.poll(() => washOf(page)).toBe("rgba(46, 134, 222, 0.28)");
});
