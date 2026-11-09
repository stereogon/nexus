/**
 * Notion's keys in the notes (2026-11-09): Tab and Shift-Tab nest lists, ⌘D duplicates,
 * ⌘⇧↑ and ⌘⇧↓ move blocks, and several lines selected are acted on together.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const NOTES = ["Alpha line", "Beta line", "Gamma line", "", "- milk", "- eggs", "", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const lines = async (page: Page) => (await saved(page)).split("\n");

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(line(page, "Alpha line")).toBeVisible();
});

test("Tab nests a list item under the one above, and Shift-Tab brings it back", async ({ page }) => {
  await line(page, "eggs").click();
  await page.keyboard.press("Tab");
  await expect.poll(() => lines(page)).toContain("  - eggs");
  // Drawn as a nested bullet.
  await expect(line(page, "eggs").locator(".md-bullet")).toHaveText("◦");

  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => lines(page)).toContain("- eggs");
});

test("Tab on ordinary words leaves them as they were", async ({ page }) => {
  await line(page, "Beta line").click();
  await page.keyboard.press("Tab");

  await expect.poll(() => lines(page)).toContain("Beta line");
  expect(await lines(page)).not.toContain("  Beta line");
});

test("⌘D duplicates the line, and ⌘⇧↑ moves it up", async ({ page }) => {
  await line(page, "Gamma line").click();
  await page.keyboard.press("Meta+d");
  await expect.poll(async () => (await lines(page)).filter((text) => text === "Gamma line")).toHaveLength(2);

  await line(page, "Beta line").click();
  await page.keyboard.press("Meta+Shift+ArrowUp");
  await expect.poll(async () => (await lines(page)).slice(0, 2)).toEqual(["Beta line", "Alpha line"]);
});

test("several lines selected are turned into headings together from ⋮⋮", async ({ page }) => {
  await line(page, "Alpha line").click();
  await page.keyboard.press("Shift+ArrowDown");
  await line(page, "Beta line").hover();
  await notes(page).getByRole("button", { name: "Move this block, or open its menu" }).click();
  await page.getByRole("menu", { name: "Block" }).getByRole("menuitem", { name: "Turn into heading 2" }).click();

  await expect.poll(async () => (await lines(page)).slice(0, 3)).toEqual(["## Alpha line", "## Beta line", "Gamma line"]);
});
