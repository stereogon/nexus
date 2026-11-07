/**
 * The format controls opened from the notes' header (2026-11-07): there before anything is
 * written, so a format can be chosen first and then typed into.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const source = (page: Page) => notes(page).locator(".cm-content");
const strip = (page: Page) => notes(page).getByRole("toolbar", { name: "Format" });
const toggle = (page: Page) => notes(page).getByRole("button", { name: "Formatting" });

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: "Raft elects a leader." } });
  await openLecture(page, READING.title);

  // The cursor on a new, empty line: nothing selected.
  await notes(page).locator(".cm-line").filter({ hasText: "Raft elects" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
});

test("the controls open from the header with nothing selected, and close again", async ({ page }) => {
  await expect(strip(page)).toHaveCount(0);

  await toggle(page).click();

  await expect(strip(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");

  await toggle(page).click();
  await expect(strip(page)).toHaveCount(0);
});

test("bold chosen before writing makes what is typed next bold", async ({ page }) => {
  await toggle(page).click();
  await strip(page).getByRole("button", { name: "Bold" }).click({ delay: 150 });
  await page.keyboard.type("quorum");

  await expect(source(page)).toContainText("**quorum**");
  await expect(strip(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
});

test("a heading chosen before writing heads the line about to be written", async ({ page }) => {
  await toggle(page).click();
  await strip(page).getByRole("button", { name: "Heading 2" }).click({ delay: 150 });
  await page.keyboard.type("Terms");

  await expect(source(page)).toContainText("## Terms");
});

test("a colour waits for words to be selected", async ({ page }) => {
  await toggle(page).click();

  await expect(strip(page).getByRole("button", { name: "Key concept" })).toBeDisabled();
});
