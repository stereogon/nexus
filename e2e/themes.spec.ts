/**
 * Themes (2026-11-07): twenty-five of them since Cyberpunk 2077 (2026-11-15), chosen in Settings, applied at once, with the
 * page left white in every one (CLAUDE.md §3: no inverted documents).
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const picker = (page: Page) => page.getByRole("dialog", { name: "Settings" });
const background = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => getComputedStyle(element).backgroundColor);

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
});

test("choosing a theme repaints the window at once, and the page stays white", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await picker(page).getByRole("radio", { name: /Neon/u }).click();

  // Neon's ground, #0b0a12.
  await expect.poll(() => background(page, ".sidebar")).toBe("rgb(11, 10, 18)");
  await expect(picker(page).getByRole("radio", { name: /Neon/u })).toHaveAttribute("aria-checked", "true");
  expect(await background(page, ".pdf-page")).toBe("rgb(255, 255, 255)");

  // Tried one after another without reopening the menu.
  await picker(page).getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: /Sepia/u }).click();
  await expect.poll(() => background(page, ".sidebar")).toBe("rgb(244, 236, 216)");
});

test("Settings closes on Escape and on a click elsewhere", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.keyboard.press("Escape");
  await expect(picker(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();
  // The bed's far corner: the box, taller since the Layout section (2026-11-14), covers the
  // near one, where a click lands inside it.
  const bed = await page.locator(".viewer-bed").boundingBox();

  await page.locator(".viewer-bed").click({ position: { x: (bed?.width ?? 10) - 5, y: 5 } });
  await expect(picker(page)).toHaveCount(0);
});

test("Cyberpunk 2077 is offered, blue-black with its key highlight pink", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await picker(page).getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: /Cyberpunk 2077/u }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "cyberpunk");
  // Its ground, #0a0d16, and the page still white.
  await expect.poll(() => background(page, ".sidebar")).toBe("rgb(10, 13, 22)");
  expect(await background(page, ".pdf-page")).toBe("rgb(255, 255, 255)");
  expect(await page.locator("html").evaluate((root) => root.style.getPropertyValue("--semantic-key"))).toBe("#ff9ad0");
});
