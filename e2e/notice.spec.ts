/**
 * The screening notice put away (2026-11-09): ✕ until the document is opened again, and
 * "Don't show again" for that document on this device, the other documents still warned.
 */
import { expect, test, type Page } from "@playwright/test";

import { OTHER, READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const LAUNCH = { code: "LAUNCHES_A_PROGRAM", severity: "notable", explanation: "It asks to run a program. Nexus never runs one." } as const;

const notice = (page: Page) => page.getByText(/Nexus does not do/u);

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), risks: { [READING.directory]: [LAUNCH], [OTHER.directory]: [LAUNCH] } });
  await openLecture(page, READING.title);
  await expect(notice(page)).toBeVisible();
});

test("✕ puts the notice away until the document is opened again", async ({ page }) => {
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice(page)).toHaveCount(0);

  await openLecture(page, OTHER.title);
  await openLecture(page, READING.title);
  await expect(notice(page)).toBeVisible();
});

test("Don't show again keeps that document quiet, and only that one", async ({ page }) => {
  await page.getByRole("button", { name: "Don't show again for this document" }).click();
  await expect(notice(page)).toHaveCount(0);

  await openLecture(page, OTHER.title);
  await expect(notice(page)).toBeVisible();

  await openLecture(page, READING.title);
  await expect(page.getByLabel("Page 1", { exact: true })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
});
