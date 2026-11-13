/**
 * Find and replace in the notes (2026-11-13): ⌘F in the notes opens it over the notes, not
 * the document's; matches are counted and stepped through; Replace and Replace all change
 * the Markdown, and ⌘Z puts it back.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const NOTES = ["Raft elects a leader.", "", "The **leader** sends heartbeats.", "", "A new LEADER wins a term."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const bar = (page: Page) => page.getByRole("search", { name: "Find in notes" });
const field = (page: Page) => bar(page).getByRole("searchbox", { name: "Find in notes" });
const count = (page: Page) => bar(page).locator(".find-count");

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await line(page, "Raft elects").click();
  await page.keyboard.press("Meta+ArrowUp");
});

test("⌘F in the notes opens their find bar, not the document's, and counts every match ignoring case", async ({ page }) => {
  await page.keyboard.press("Meta+f");
  await expect(field(page)).toBeFocused();
  await expect(page.getByRole("search", { name: "Find in document" })).toHaveCount(0);

  await page.keyboard.type("leader");
  await expect(count(page)).toHaveText("1 of 3");
  await expect(notes(page).locator(".md-find")).toHaveCount(3);
  await expect(notes(page).locator(".md-find-current")).toHaveText("leader");

  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText("2 of 3");
  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText("3 of 3");
  await expect(notes(page).locator(".md-find-current")).toHaveText("LEADER");
  // Round the end, and back.
  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText("1 of 3");
  await page.keyboard.press("Shift+Enter");
  await expect(count(page)).toHaveText("3 of 3");

  // Escape closes it, the marks gone, and the typing back in the notes.
  await page.keyboard.press("Escape");
  await expect(bar(page)).toHaveCount(0);
  await expect(notes(page).locator(".md-find")).toHaveCount(0);
  await expect(notes(page).locator(".cm-content")).toBeFocused();

  // Open again while writing, Escape in the notes closes it too.
  await page.keyboard.press("Meta+f");
  await notes(page).locator(".cm-content").focus();
  await page.keyboard.press("Escape");
  await expect(bar(page)).toHaveCount(0);
});

test("Replace changes the match being looked at and moves on; ⌘Z puts it back", async ({ page }) => {
  await page.keyboard.press("Meta+f");
  await page.keyboard.type("leader");
  await bar(page).getByRole("textbox", { name: "Replace with" }).fill("candidate");
  await bar(page).getByRole("button", { name: "Replace", exact: true }).click();

  await expect.poll(() => saved(page)).toContain("Raft elects a candidate.");
  // Bold words found and replaced inside their marks, which stay.
  await expect(count(page)).toHaveText("1 of 2");
  await bar(page).getByRole("button", { name: "Replace", exact: true }).click();
  await expect.poll(() => saved(page)).toContain("The **candidate** sends");
  await expect.poll(() => saved(page)).toContain("A new LEADER wins");

  await notes(page).locator(".cm-content").focus();
  await page.keyboard.press("Meta+z");
  await expect.poll(() => saved(page)).toContain("The **leader** sends");
});

test("Replace all changes every match in one step that one ⌘Z undoes", async ({ page }) => {
  await page.keyboard.press("Meta+f");
  await page.keyboard.type("leader");
  await bar(page).getByRole("textbox", { name: "Replace with" }).fill("node");
  await bar(page).getByRole("button", { name: "Replace all" }).click();

  await expect(count(page)).toHaveText("Replaced 3");
  await expect.poll(() => saved(page)).toBe(["Raft elects a node.", "", "The **node** sends heartbeats.", "", "A new node wins a term."].join("\n"));

  await notes(page).locator(".cm-content").focus();
  await page.keyboard.press("Meta+z");
  await expect.poll(() => saved(page)).toBe(NOTES);
});

test("⌘F with words selected looks for them", async ({ page }) => {
  await line(page, "heartbeats").click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Alt+Shift+ArrowLeft");

  await page.keyboard.press("Meta+f");
  await expect(field(page)).toHaveValue("heartbeats");
  await expect(count(page)).toHaveText("1 of 1");
});
