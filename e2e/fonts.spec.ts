/**
 * The window's font (2026-11-14, at the user's request, after Slack's setting): the theme's
 * own, Mono or System, chosen in Settings and drawn at once in the interface and the notes;
 * Funky brings its own, Recursive; and the one this device chose is the one it opens in.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const fonts = (page: Page) => page.getByRole("dialog", { name: "Settings" }).getByRole("radiogroup", { name: "Font" });
const family = (page: Page, selector: string) => page.locator(selector).first().evaluate((element) => getComputedStyle(element).fontFamily);
// The first face in the stack, and whether the browser has it loaded rather than a fallback.
const loaded = (page: Page, face: string) => page.evaluate(async (name) => document.fonts.load(`16px "${name}"`).then((found) => found.length > 0), face);

const UI = ".sidebar-list";
const NOTES = ".cm-content";

async function open(page: Page, fixture = standardFixture()): Promise<void> {
  await openNexus(page, fixture);
  await openLecture(page, READING.title);
}

test("choosing Mono or System draws the interface and the notes in it, and Theme undoes it", async ({ page }) => {
  await open(page);
  expect(await family(page, UI)).toMatch(/^"?IBM Plex Sans/u);
  expect(await family(page, NOTES)).toMatch(/^"?Literata/u);

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(fonts(page).getByRole("radio")).toHaveCount(3);
  await fonts(page).getByRole("radio", { name: /Mono/u }).click();
  expect(await family(page, UI)).toMatch(/^"?IBM Plex Mono/u);
  expect(await family(page, NOTES)).toMatch(/^"?IBM Plex Mono/u);

  await fonts(page).getByRole("radio", { name: /System/u }).click();
  await expect(page.locator("html")).toHaveAttribute("data-font", "system");
  expect(await family(page, UI)).toMatch(/^-apple-system/u);
  expect(await family(page, NOTES)).toMatch(/^-apple-system/u);

  await fonts(page).getByRole("radio", { name: /^Theme/u }).click();
  expect(await family(page, NOTES)).toMatch(/^"?Literata/u);
});

test("Funky brings Recursive, and a chosen font is the person's over the theme's", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: /Funky/u }).click();

  expect(await family(page, UI)).toMatch(/^"?Recursive/u);
  expect(await family(page, NOTES)).toMatch(/^"?Recursive/u);
  expect(await loaded(page, "Recursive")).toBe(true);

  await fonts(page).getByRole("radio", { name: /System/u }).click();
  expect(await family(page, NOTES)).toMatch(/^-apple-system/u);
});

test("the window opens in the font this device last chose", async ({ page }) => {
  await open(page, { ...standardFixture(), font: "mono" });

  await expect(page.locator("html")).toHaveAttribute("data-font", "mono");
  expect(await family(page, NOTES)).toMatch(/^"?IBM Plex Mono/u);
});
