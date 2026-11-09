/**
 * The selection drawn inside the writing (2026-11-09): across lines it stays in the text
 * column, not out into the margins; whole lines are drawn as Notion's selected blocks.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const NOTES = ["Alpha line", "Beta line", "Gamma line", "", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const marks = (page: Page) => notes(page).locator(".md-selection-layer .cm-selectionBackground");

/** The text column: the content's box inside its padding. */
async function column(page: Page): Promise<{ left: number; right: number }> {
  return notes(page)
    .locator(".cm-content")
    .evaluate((content) => {
      const box = content.getBoundingClientRect();
      const style = getComputedStyle(content);

      return { left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight) };
    });
}

/** Every drawn piece of the selection, in window coordinates. */
async function pieces(page: Page) {
  return marks(page).evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();

      return { left: box.left, right: box.right, block: element.classList.contains("md-block-selected") };
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(line(page, "Alpha line")).toBeVisible();
});

test("a selection across lines stays inside the text column", async ({ page }) => {
  await line(page, "Alpha line").click();
  await page.keyboard.press("Meta+ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");

  await expect(marks(page).first()).toBeVisible();
  const { left, right } = await column(page);
  const drawn = await pieces(page);

  expect(drawn.length).toBeGreaterThan(1);
  for (const piece of drawn) {
    expect(piece.left).toBeGreaterThanOrEqual(left - 0.5);
    expect(piece.right).toBeLessThanOrEqual(right + 0.5);
    expect(piece.block).toBe(false);
  }
  // The editor's own layer, which ran into the margins, is not what shows.
  await expect(notes(page).locator(".cm-selectionLayer")).toBeHidden();
});

test("whole lines selected are drawn as blocks, one to a line", async ({ page }) => {
  await line(page, "Alpha line").click();
  await page.keyboard.press("Meta+ArrowLeft");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+Meta+ArrowRight");

  await expect(marks(page)).toHaveCount(3);
  const { left, right } = await column(page);

  for (const piece of await pieces(page)) {
    expect(piece.block).toBe(true);
    expect(piece.left).toBeCloseTo(left, 0);
    expect(piece.right).toBeCloseTo(right, 0);
  }
});
