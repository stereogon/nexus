/**
 * ⌘P, which opens the search window, and ⌘0, which opens the error panel.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

function search(page: Page) {
  return page.getByRole("dialog", { name: "Search everything" }).getByRole("combobox");
}

function errorPanel(page: Page) {
  return page.getByRole("complementary", { name: "Errors" });
}

test("⌘P opens the search window with the cursor in it, the last search ready to replace", async ({ page }) => {
  await openNexus(page);
  await expect(page.getByRole("button", { name: /Search everything/u })).toBeVisible();

  await page.keyboard.press("Meta+p");
  await expect(search(page)).toBeFocused();
  await page.keyboard.type("raft");
  await page.keyboard.press("Escape");
  await expect(search(page)).toHaveCount(0);

  await page.keyboard.press("Meta+p");
  await expect(search(page)).toHaveValue("raft");
  await page.keyboard.type("process");
  await expect(search(page)).toHaveValue("process");
});

test("⌘P works with the sidebar hidden, and Enter opens the first result", async ({ page }) => {
  await openNexus(page);
  await page.getByRole("button", { name: "Hide sidebar" }).click();

  await page.keyboard.press("Meta+p");
  await page.keyboard.type("process");
  await page.keyboard.press("Enter");

  await expect(search(page)).toHaveCount(0);
  await expect(page.getByLabel("Page 1", { exact: true })).toBeVisible();
  await expect(page.locator(".viewer-title")).toContainText(READING.title);
});

test("↓ moves the choice and keeps it in view", async ({ page }) => {
  await openNexus(page);
  await expect(page.getByRole("button", { name: /Search everything/u })).toBeVisible();
  await page.keyboard.press("Meta+p");
  await page.keyboard.type("week-");

  const options = page.getByRole("listbox", { name: "Results" }).getByRole("option");

  await expect(options).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(options.nth(1)).toBeInViewport();
});

test("⌘0 opens the error panel, which says when nothing has gone wrong", async ({ page }) => {
  await openNexus(page);
  // Bound once a vault is open, which the restore makes a moment after the window loads.
  await expect(page.getByRole("button", { name: /Search everything/u })).toBeVisible();

  await page.keyboard.press("Meta+0");
  await expect(errorPanel(page)).toContainText("Nothing has gone wrong");

  await page.keyboard.press("Meta+0");
  await expect(errorPanel(page)).toHaveCount(0);
});

test("an error stays in the panel after its card has gone", async ({ page }) => {
  await openNexus(page, { ...standardFixture(), failing: ["load_annotations"] });
  await openLecture(page, READING.title);
  await expect(page.locator(".failure")).toContainText("ERR_E2E_FAILING");

  // The card belongs to the lecture; going back to the vault takes it away.
  await page.getByRole("button", { name: "Close document" }).click();
  await expect(page.locator(".failure")).toHaveCount(0);

  // Settings says there was one, before it is opened.
  await page.getByRole("button", { name: "Settings, 1 error since launch" }).click();
  await page.getByRole("button", { name: /Errors since launch/u }).click();
  await expect(errorPanel(page).locator(".error-panel-entry")).toHaveCount(1);
  await expect(errorPanel(page)).toContainText("ERR_E2E_FAILING");

  await page.keyboard.press("Escape");
  await expect(errorPanel(page)).toHaveCount(0);
});
