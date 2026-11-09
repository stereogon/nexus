/**
 * A document's notes on their own (2026-11-09): the document hidden, the notes a page, and
 * a button in view bringing the document back; side by side stays the default.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const pageOne = (page: Page) => page.getByLabel("Page 1", { exact: true });

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: "Raft elects a leader." } });
  await openLecture(page, READING.title);
  await expect(pageOne(page)).toBeVisible();
});

test("Notes only hides the document and keeps the same notes, as a page", async ({ page }) => {
  // Marked, to tell the same editor from a rebuilt one.
  await notes(page).locator(".cm-editor").evaluate((editor) => {
    editor.setAttribute("data-probe", "kept");
  });

  await notes(page).getByRole("button", { name: "Notes only" }).click();

  await expect(pageOne(page)).toHaveCount(0);
  await expect(notes(page)).toHaveClass(/alone/);
  await expect(notes(page).locator(".notes-title")).toContainText(READING.title);
  await expect(notes(page).locator(".cm-editor")).toHaveAttribute("data-probe", "kept");

  await notes(page).locator(".cm-line").filter({ hasText: "Raft elects" }).click();
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.type(" By majority.");
  await expect.poll(() => saved(page)).toBe("Raft elects a leader. By majority.");
});

test("Show document, or ⌘\\, brings the document back beside the notes", async ({ page }) => {
  await notes(page).getByRole("button", { name: "Notes only" }).click();
  await notes(page).getByRole("button", { name: "Show document" }).click();

  await expect(pageOne(page)).toBeVisible();
  await expect(notes(page)).not.toHaveClass(/alone/);

  await notes(page).getByRole("button", { name: "Notes only" }).click();
  await expect(pageOne(page)).toHaveCount(0);
  await page.keyboard.press("Meta+\\");
  await expect(pageOne(page)).toBeVisible();
});
