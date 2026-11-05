/**
 * Finding words in the open document (⌘F).
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { openLecture, openNexus, pageField, settleOn, textOn } from "./nexus";

const bar = (page: Page) => page.getByRole("search", { name: "Find in document" });
const field = (page: Page) => bar(page).getByRole("searchbox", { name: "Find in document" });
const count = (page: Page) => bar(page).locator(".find-count");

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
  await expect(textOn(page, 1).first()).toBeVisible();
});

test("⌘F opens the find bar ready to type, and counts the matches", async ({ page }) => {
  await page.keyboard.press("Meta+f");
  await expect(field(page)).toBeFocused();

  await page.keyboard.type("BODY TEXT");

  // One on each of the twelve pages, ignoring case; starting on the page being read.
  await expect(count(page)).toHaveText("1 of 12");
  await expect(page.locator(".find-mark.current")).toHaveCount(1);
});

test("the current match is marked over its words", async ({ page }) => {
  await page.keyboard.press("Meta+f");
  await page.keyboard.type("body text");

  const mark = await page.locator(".find-mark.current").boundingBox();
  const words = await textOn(page, 1).filter({ hasText: "Body text on page 1" }).boundingBox();

  if (mark === null || words === null) {
    throw new Error("The mark or its words are not laid out.");
  }

  expect(Math.abs(mark.y + mark.height / 2 - (words.y + words.height / 2))).toBeLessThan(4);
  expect(Math.abs(mark.x - words.x)).toBeLessThan(4);
  // "Body text" is the start of "Body text on page 1", not all of it.
  expect(mark.width).toBeLessThan(words.width * 0.75);
});

test("Enter goes to the next match, on the next page, and Shift-Enter back", async ({ page }) => {
  await page.keyboard.press("Meta+f");
  await page.keyboard.type("body text");
  await expect(count(page)).toHaveText("1 of 12");

  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText("2 of 12");
  await expect(page.locator(".find-mark.current")).toBeInViewport();
  await expect(pageField(page)).toHaveValue("2");

  await page.keyboard.press("Shift+Enter");
  await expect(count(page)).toHaveText("1 of 12");
});

test("a search starts from the page being read", async ({ page }) => {
  await pageField(page).fill("5");
  await pageField(page).press("Enter");
  await settleOn(page, 5);

  await page.keyboard.press("Meta+f");
  await page.keyboard.type("body text");

  await expect(count(page)).toHaveText("5 of 12");
});

test("words that are not there say so, and leave nothing to step through", async ({ page }) => {
  await page.keyboard.press("Meta+f");
  await page.keyboard.type("paxos");

  await expect(count(page)).toHaveText("No matches");
  await expect(bar(page).getByRole("button", { name: "Next match" })).toBeDisabled();
  await expect(page.locator(".find-mark")).toHaveCount(0);
});

test("Escape closes the bar and takes the marks off the page", async ({ page }) => {
  await page.keyboard.press("Meta+f");
  await page.keyboard.type("body text");
  await expect(page.locator(".find-mark").first()).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(bar(page)).toHaveCount(0);
  await expect(page.locator(".find-mark")).toHaveCount(0);
});
