/**
 * Themes (2026-11-07): fifteen of them, chosen from a picker, applied at once, with the
 * page left white in every one (CLAUDE.md §3: no inverted documents).
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const picker = (page: Page) => page.getByRole("menu", { name: "Theme" });
const background = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => getComputedStyle(element).backgroundColor);

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
});

test("choosing a theme repaints the window at once, and the page stays white", async ({ page }) => {
  await page.getByRole("button", { name: "Theme" }).click();
  await picker(page).getByRole("menuitemradio", { name: /Neon/u }).click();

  // Neon's ground, #0b0a12.
  await expect.poll(() => background(page, ".sidebar")).toBe("rgb(11, 10, 18)");
  await expect(picker(page).getByRole("menuitemradio", { name: /Neon/u })).toHaveAttribute("aria-checked", "true");
  expect(await background(page, ".pdf-page")).toBe("rgb(255, 255, 255)");

  // Tried one after another without reopening the menu.
  await picker(page).getByRole("menuitemradio", { name: /Sepia/u }).click();
  await expect.poll(() => background(page, ".sidebar")).toBe("rgb(244, 236, 216)");
});

test("the picker closes on Escape and on a click elsewhere", async ({ page }) => {
  await page.getByRole("button", { name: "Theme" }).click();
  await page.keyboard.press("Escape");
  await expect(picker(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Theme" }).click();
  await page.locator(".viewer-bed").click({ position: { x: 5, y: 5 } });
  await expect(picker(page)).toHaveCount(0);
});
