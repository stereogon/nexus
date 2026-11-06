/**
 * Reopening a lecture where this device left it, and reopening the last lecture on launch.
 */
import { expect, test } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, pageField, settleOn } from "./nexus";

test("a lecture reopens at the page it was left on", async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);

  await pageField(page).fill("5");
  await pageField(page).press("Enter");
  await settleOn(page, 5);

  await page.getByRole("button", { name: "← Vault" }).click();
  // Not `openLecture`, which waits for page 1 to be drawn: it is not, being far above.
  await page.getByRole("button", { name: READING.title, exact: true }).click();

  await settleOn(page, 5);
  await expect(pageField(page)).toHaveValue("5");
});

test("starting Nexus again reopens the last lecture at its place", async ({ page }) => {
  // What a previous session left in Application Support.
  await openNexus(page, {
    ...standardFixture(),
    lastLecture: READING.directory,
    positions: { [READING.directory]: { page: 4, offset: 0 } },
  });

  await expect(page.getByRole("button", { name: "← Vault" })).toBeVisible();
  await settleOn(page, 4);
});

test("a lecture never opened before starts at the first page", async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);

  await expect(pageField(page)).toHaveValue("1");
});
