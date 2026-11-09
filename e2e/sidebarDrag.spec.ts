/**
 * Dragging in the sidebar to move things (2026-11-09): an item or a folder onto a folder,
 * or up the folder path above the list. A click that does not move still opens.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { OTHER, READING } from "./fixture";
import { openNexus } from "./nexus";

const sidebar = (page: Page) => page.locator(".sidebar");
const folderRow = (page: Page, name: string) => sidebar(page).getByRole("button", { name: `Folder ${name}`, exact: true });
const crumbs = (page: Page) => page.getByRole("navigation", { name: "Folder" });

async function drag(page: Page, from: Locator, to: Locator): Promise<void> {
  const start = await from.boundingBox();
  const end = await to.boundingBox();

  await page.mouse.move((start?.x ?? 0) + 30, (start?.y ?? 0) + 8);
  await page.mouse.down();
  await page.mouse.move((start?.x ?? 0) + 40, (start?.y ?? 0) + 20, { steps: 3 });
  await page.mouse.move((end?.x ?? 0) + 30, (end?.y ?? 0) + 8, { steps: 6 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await expect(folderRow(page, "week-1")).toBeVisible();
});

test("a folder dragged onto another moves inside it, with what it holds", async ({ page }) => {
  await drag(page, folderRow(page, "week-1"), folderRow(page, "week-2"));

  await expect(folderRow(page, "week-1")).toHaveCount(0);
  await folderRow(page, "week-2").click();
  await folderRow(page, "week-1").click();
  await expect(sidebar(page).getByRole("button", { name: new RegExp(OTHER.title, "u") }).first()).toBeVisible();
});

test("an item dragged up the folder path moves to the top of the vault", async ({ page }) => {
  await folderRow(page, "week-2").click();
  const item = sidebar(page).getByRole("button", { name: new RegExp(READING.title, "u") }).first();

  await drag(page, item, crumbs(page).getByRole("button", { name: "e2e-vault" }));

  await expect(page.getByRole("status")).toContainText("to the top of the vault");
  await crumbs(page).getByRole("button", { name: "e2e-vault" }).click();
  await expect(sidebar(page).getByRole("button", { name: new RegExp(READING.title, "u") }).first()).toBeVisible();
});

test("a press that does not move is still a click, and a folder never drops on itself", async ({ page }) => {
  await drag(page, folderRow(page, "week-1"), folderRow(page, "week-1"));
  await expect(folderRow(page, "week-1")).toBeVisible();
  await expect(page.locator(".failure-float")).toHaveCount(0);

  await folderRow(page, "week-1").click();
  await expect(crumbs(page).getByRole("button", { name: "week-1" })).toHaveAttribute("aria-current", "location");
});
