/**
 * Setting how wide the notes are, with the divider between them and the document.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { openLecture, openNexus } from "./nexus";

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
});

function notes(page: Page) {
  return page.getByRole("complementary", { name: "Notes" });
}

function divider(page: Page) {
  return page.getByRole("separator", { name: "Notes width" });
}

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).boundingBox();

  if (found === null) {
    throw new Error(`${selector} is not laid out.`);
  }

  return found;
}

async function notesWidth(page: Page): Promise<number> {
  return (await box(page, ".notes-pane")).width;
}

/**
 * Within one pixel: a chosen width is recorded in whole pixels, and the default it starts
 * from — a share of the window — usually is not.
 */
function expectNear(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

/** Drags the divider by `by` pixels; negative is to the left, widening the notes. */
async function drag(page: Page, by: number): Promise<void> {
  const handle = await divider(page).boundingBox();

  if (handle === null) {
    throw new Error("The divider is not laid out.");
  }

  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by / 2, y, { steps: 4 });
  await page.mouse.move(x + by, y, { steps: 4 });
  await page.mouse.up();
}

test("dragging the divider widens the notes and narrows the document", async ({ page }) => {
  const before = await notesWidth(page);
  const documentBefore = await box(page, ".viewer");

  await drag(page, -150);

  expectNear(await notesWidth(page), before + 150);
  expectNear((await box(page, ".viewer")).width, documentBefore.width - 150);
});

test("the width chosen is kept when the lecture is opened again", async ({ page }) => {
  await drag(page, -120);
  const chosen = await notesWidth(page);

  await page.getByRole("button", { name: "← Vault" }).click();
  await openLecture(page, READING.title);

  await expect.poll(async () => Math.abs((await notesWidth(page)) - chosen)).toBeLessThanOrEqual(1);
});

test("the document always keeps room for a page", async ({ page }) => {
  await drag(page, -2000);

  expect((await box(page, ".viewer")).width).toBeGreaterThanOrEqual(359);
  // And the other way, the notes stop at their narrowest rather than vanishing.
  await drag(page, 2000);

  expect(await notesWidth(page)).toBeGreaterThanOrEqual(299);
});

test("the arrow keys move the divider, further with Shift", async ({ page }) => {
  const before = await notesWidth(page);

  await divider(page).focus();
  await page.keyboard.press("ArrowLeft");
  expectNear(await notesWidth(page), before + 16);

  await page.keyboard.press("Shift+ArrowLeft");
  expectNear(await notesWidth(page), before + 80);

  await page.keyboard.press("ArrowRight");
  expectNear(await notesWidth(page), before + 64);
});

test("hiding the notes takes the divider with them", async ({ page }) => {
  await notes(page).getByRole("button", { name: "Hide notes" }).click();

  await expect(divider(page)).toHaveCount(0);
});
