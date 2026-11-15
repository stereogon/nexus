/**
 * Colouring words in the notes (2026-11-15, at the user's request, after Notion): the A in
 * the format bar, text or background, stored as Notion writes it.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const NOTES = ["TCP begins in slow start.", "", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const bar = (page: Page) => page.getByRole("toolbar", { name: "Format" });
const menu = (page: Page) => page.getByRole("dialog", { name: "Colour" });

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
});

/** Selects "slow start", as a drag across it would. */
async function selectWords(page: Page): Promise<void> {
  await line(page, "TCP begins").click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await page.keyboard.press("Alt+Shift+ArrowLeft");
}

test("the A colours selected words, recolours them as a background, and Default takes it off", async ({ page }) => {
  await selectWords(page);
  await bar(page).getByRole("button", { name: "Colour" }).click();
  await menu(page).getByRole("button", { name: "Red text" }).click();

  const words = line(page, "TCP begins").locator(".md-paint");

  await expect(words).toHaveAttribute("data-paint", "red");
  await expect(words).toHaveText("slow start");
  // The tags are hidden; the line reads as its words.
  await expect(line(page, "TCP begins")).toHaveText("TCP begins in slow start.");
  await expect.poll(() => saved(page)).toContain('TCP begins in <span color="red">slow start</span>.');
  expect(await words.evaluate((element) => getComputedStyle(element).color)).not.toBe(
    await line(page, "The end.").evaluate((element) => getComputedStyle(element).color),
  );

  // Inside the coloured words again: the menu rings red, and a background replaces it.
  await words.click();
  await page.keyboard.press("Shift+ArrowRight");
  await bar(page).getByRole("button", { name: "Colour" }).click();
  await expect(menu(page).getByRole("button", { name: "Red text" })).toHaveAttribute("aria-pressed", "true");
  await menu(page).getByRole("button", { name: "Yellow background" }).click();
  await expect.poll(() => saved(page)).toContain('<span color="yellow_bg">slow start</span>');

  await line(page, "TCP begins").locator(".md-paint").click();
  await page.keyboard.press("Shift+ArrowRight");
  await bar(page).getByRole("button", { name: "Colour" }).click();
  await menu(page).getByRole("button", { name: "Default background" }).click();
  await expect.poll(() => saved(page)).toContain("TCP begins in slow start.");
  await expect(line(page, "TCP begins").locator(".md-paint")).toHaveCount(0);
});

test("the colour menu closes on Escape, and waits for words to be selected", async ({ page }) => {
  await line(page, "The end.").click();
  await expect(bar(page)).toHaveCount(0);

  await selectWords(page);
  await bar(page).getByRole("button", { name: "Colour" }).click();
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole("button", { name: "Blue text" }).focus();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
});
