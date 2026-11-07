/**
 * Notion's handles in the notes (2026-11-07): + and ⋮⋮ beside the line under the pointer,
 * and the headings as dashes down the right edge.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const FILLER = Array.from({ length: 40 }, (_, at) => `Filler line ${String(at + 1)}.`);
const NOTES = ["Alpha line", "Beta line", "Gamma line", "", "# First", ...FILLER, "## Second", ...FILLER, "## Third", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const source = async (page: Page) => (await notes(page).locator(".cm-content").innerText()).split("\n");

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(line(page, "Alpha line")).toBeVisible();
});

test("hovering a line shows its handle, and + adds a line below it", async ({ page }) => {
  await line(page, "Alpha line").hover();

  await expect(notes(page).getByRole("button", { name: "Move or select this block" })).toBeVisible();
  await notes(page).getByRole("button", { name: "Add a line below" }).click();
  await page.keyboard.type("Inserted");

  const lines = await source(page);
  expect(lines.indexOf("Inserted")).toBe(lines.indexOf("Alpha line") + 1);
});

test("dragging ⋮⋮ moves the line, and the move is saved", async ({ page }) => {
  await line(page, "Gamma line").hover();

  const grip = notes(page).getByRole("button", { name: "Move or select this block" });
  const from = await grip.boundingBox();
  const target = await line(page, "Alpha line").boundingBox();

  if (from === null || target === null) {
    throw new Error("The handle or the target line is not laid out.");
  }

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, target.y + 3, { steps: 8 });
  await expect(notes(page).locator(".block-drop")).toBeVisible();
  await page.mouse.up();

  expect((await source(page)).slice(0, 3)).toEqual(["Gamma line", "Alpha line", "Beta line"]);
  await expect(notes(page).locator(".notes-status")).toHaveText("Saved");
});

test("clicking ⋮⋮ selects the line, so the format bar can turn it into a heading", async ({ page }) => {
  await line(page, "Beta line").hover();
  await notes(page).getByRole("button", { name: "Move or select this block" }).click();

  const bar = page.getByRole("toolbar", { name: "Format" });
  await bar.getByRole("button", { name: "Heading 2" }).click({ delay: 150 });

  await expect.poll(() => source(page)).toContain("## Beta line");
});

test("the headings run down the right edge, follow the reading, and take you there", async ({ page }) => {
  const rail = notes(page).getByRole("navigation", { name: "Headings" });
  const dashes = rail.locator(".heading-dash");

  await expect(dashes).toHaveCount(3);
  await expect(dashes.nth(0)).toHaveAttribute("data-current", "true");

  await rail.hover();
  await rail.getByRole("button", { name: "Third" }).click();

  await expect(line(page, "The end.")).toBeInViewport();
  await expect(dashes.nth(2)).toHaveAttribute("data-current", "true");
});
