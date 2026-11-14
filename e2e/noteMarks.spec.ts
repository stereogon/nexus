/**
 * Highlighting text in the notes, in the document's four meanings (2026-11-05).
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const NOTES = ["Raft elects a leader by majority.", "Use `==x==` in code.", "", "The end.", "", "How fast ==can we go ?=={question} now."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const bar = (page: Page) => page.getByRole("group", { name: "Highlight as" });

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
});

/** Selects the word just before the end of the first line, as Option+Shift+← does. */
async function selectLastWord(page: Page): Promise<void> {
  await line(page, "Raft elects").click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Alt+Shift+ArrowLeft");
}

test("selecting words offers the four meanings, and choosing one highlights them", async ({ page }) => {
  await selectLastWord(page);
  // Held for a moment, as a person presses: an instant press can land before the editor's
  // loss of focus has closed the bar, and would pass without the guard that keeps it open.
  await bar(page).getByRole("button", { name: "Exam / important" }).click({ delay: 150 });

  await expect(line(page, "Raft elects").locator('.md-mark[data-semantic="exam"]')).toHaveText("majority");

  // The markup is hidden and only the colour remains, on the cursor's line and off it.
  for (const where of ["Raft elects", "The end."]) {
    await line(page, where).click();
    await expect(line(page, "Raft elects")).toHaveText("Raft elects a leader by majority.");
  }

  // Underneath, the form the notes store.
  await expect.poll(() => saved(page)).toContain("==majority=={exam}");
});

test("a highlight can be recoloured and removed from the same bar", async ({ page }) => {
  await selectLastWord(page);
  await bar(page).getByRole("button", { name: "Key concept" }).click();

  // Select inside it again: the bar shows its meaning and offers Remove.
  await line(page, "Raft elects").click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(bar(page).getByRole("button", { name: "Key concept" })).toHaveAttribute("aria-pressed", "true");

  await bar(page).getByRole("button", { name: "Remove" }).click();

  await expect(line(page, "Raft elects").locator(".md-mark")).toHaveCount(0);
  await expect(line(page, "Raft elects")).toContainText("Raft elects a leader by majority.");
});

test("⌘⇧H marks the selection as a key concept", async ({ page }) => {
  await selectLastWord(page);
  await page.keyboard.press("Meta+Shift+H");

  await expect(line(page, "Raft elects").locator('.md-mark[data-semantic="key"]')).toHaveText("majority");
});

test("== inside code stays code", async ({ page }) => {
  await line(page, "The end.").click();

  await expect(line(page, "in code").locator(".md-mark")).toHaveCount(0);
});

test("deleting all of a highlight's words takes the highlight with them, leaving no ==", async ({ page }) => {
  await selectLastWord(page);
  await bar(page).getByRole("button", { name: "Exam / important" }).click({ delay: 150 });
  await expect.poll(() => saved(page)).toContain("==majority=={exam}");

  // The words as they are seen, selected and deleted.
  await line(page, "Raft elects").locator('.md-mark[data-semantic="exam"]').dblclick();
  await page.keyboard.press("Backspace");

  // The first line only: the second rightly keeps its `==x==`, inside code.
  await expect.poll(async () => (await saved(page)).split("\n")[0]).toBe("Raft elects a leader by .");
});

test("a highlight carries its meaning's letter after its words, as the document's do", async ({ page }) => {
  await selectLastWord(page);
  await bar(page).getByRole("button", { name: "Exam / important" }).click({ delay: 150 });

  const glyph = line(page, "Raft elects").locator('.md-mark-glyph[data-semantic="exam"]');

  await expect(glyph).toHaveAttribute("data-glyph", "E");
  await expect(line(page, "can we go").locator('.md-mark-glyph[data-semantic="question"]')).toHaveAttribute("data-glyph", "Q");

  // Drawn, not text: the line reads as its words alone.
  await expect(line(page, "Raft elects")).toHaveText("Raft elects a leader by majority.");
  expect(await glyph.evaluate((element) => getComputedStyle(element, "::after").content)).toBe('"E"');
});

test("Backspace on a highlight's last letter, after a space, keeps the highlight", async ({ page }) => {
  const words = line(page, "can we go").locator('.md-mark[data-semantic="question"]');
  const box = await words.boundingBox();

  expect(box).not.toBeNull();
  await words.click({ position: { x: (box?.width ?? 0) - 1, y: (box?.height ?? 0) / 2 } });
  await page.keyboard.press("Backspace");

  await expect(words).toHaveText("can we go");
  await expect(line(page, "How fast")).not.toContainText("==");
  await expect.poll(async () => (await saved(page)).split("\n")[5]).toBe("How fast ==can we go=={question}  now.");
});
