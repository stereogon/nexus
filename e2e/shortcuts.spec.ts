/**
 * ⌘P, which goes to the search, and ⌘0, which opens the error panel.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

function search(page: Page) {
  return page.getByRole("searchbox", { name: "Search vault" });
}

function errorPanel(page: Page) {
  return page.getByRole("complementary", { name: "Errors" });
}

test("⌘P puts the cursor in the search, ready to replace what was there", async ({ page }) => {
  await openNexus(page);
  await search(page).fill("raft");
  await page.locator(".viewer, .pane").first().click({ position: { x: 4, y: 4 } });

  await page.keyboard.press("Meta+p");
  await expect(search(page)).toBeFocused();

  await page.keyboard.type("process");
  await expect(search(page)).toHaveValue("process");
});

test("⌘P shows the sidebar when it was hidden", async ({ page }) => {
  await openNexus(page);
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(search(page)).toHaveCount(0);

  await page.keyboard.press("Meta+p");

  await expect(search(page)).toBeFocused();
});

test("⌘0 opens the error panel, which says when nothing has gone wrong", async ({ page }) => {
  await openNexus(page);
  // Bound once a vault is open, which the restore makes a moment after the window loads.
  await expect(search(page)).toBeVisible();

  await page.keyboard.press("Meta+0");
  await expect(errorPanel(page)).toContainText("Nothing has gone wrong");

  await page.keyboard.press("Meta+0");
  await expect(errorPanel(page)).toHaveCount(0);
});

test("an error stays in the panel after its card has gone", async ({ page }) => {
  await openNexus(page, { ...standardFixture(), failing: ["load_annotations"] });
  await openLecture(page, READING.title);
  await expect(page.locator(".card.error")).toContainText("ERR_E2E_FAILING");

  // The card belongs to the lecture; going back to the vault takes it away.
  await page.getByRole("button", { name: "← Vault" }).click();
  await expect(page.locator(".card.error")).toHaveCount(0);

  // Settings says there was one, before it is opened.
  await page.getByRole("button", { name: "Settings, 1 error since launch" }).click();
  await page.getByRole("button", { name: /Errors since launch/u }).click();
  await expect(errorPanel(page).locator(".error-panel-entry")).toHaveCount(1);
  await expect(errorPanel(page)).toContainText("ERR_E2E_FAILING");

  await page.keyboard.press("Escape");
  await expect(errorPanel(page)).toHaveCount(0);
});
