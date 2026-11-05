/**
 * Making, finding and removing a highlight — with a real mouse, in WebKit.
 *
 * The badge and menu bugs both came from what the browser reports for a mouse selection
 * and where things land on a real page, so the selections here are real drags rather than
 * ranges built in script.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { bed, dragAcross, openLecture, openNexus, pageField, settleOn, textOn } from "./nexus";

const MENU = { name: "Highlight as" } as const;

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
});

/** Highlights the first line of page 1 as a key concept. */
async function highlightHeading(page: Page): Promise<void> {
  await dragAcross(page, textOn(page, 1).filter({ hasText: "Page 1 heading" }));
  await page.getByRole("group", MENU).getByRole("button", { name: "Key concept" }).click();
  await expect(page.locator(".highlight").first()).toBeVisible();
}

test("a selection becomes a highlight drawn over its words", async ({ page }) => {
  const words = textOn(page, 1).filter({ hasText: "Page 1 heading" });

  await highlightHeading(page);

  const fill = await page.locator(".highlight").first().boundingBox();
  const text = await words.boundingBox();

  if (fill === null || text === null) {
    throw new Error("The highlight or its words are not laid out.");
  }

  // Over the words: their vertical middles agree to within a few pixels.
  expect(Math.abs(fill.y + fill.height / 2 - (text.y + text.height / 2))).toBeLessThan(6);
});

test("a drag past the end of the line still selects it", async ({ page }) => {
  // Found by this suite on 2026-11-05. The pointer leaving the last span put it over
  // nothing, WebKit collapsed the selection, and no menu appeared -- for the commonest way
  // there is to select a line. Fixed by porting pdf.js's `.endOfContent` technique.
  const words = textOn(page, 1).filter({ hasText: "Page 1 heading" });

  await dragAcross(page, words, 200);
  await page.getByRole("group", MENU).getByRole("button", { name: "Key concept" }).click();

  const fill = await page.locator(".highlight").first().boundingBox();
  const text = await words.boundingBox();

  if (fill === null || text === null) {
    throw new Error("The highlight or its words are not laid out.");
  }

  // On the words, starting where they start, and not stretched across the page by the
  // element that made the drag work: it is as wide as the layer while a drag is on.
  expect(Math.abs(fill.x - text.x)).toBeLessThan(4);
  expect(fill.width).toBeLessThan(text.width + 8);
  expect(fill.height).toBeLessThan(text.height * 1.5);
});

test("the badge sits beside its highlight, not in the corner of the page", async ({ page }) => {
  // Reported 2026-10-29 with a screenshot: a highlight on the first line of a slide put
  // its glyph in the page's bottom-right corner, where it read as unremovable.
  await highlightHeading(page);

  const fill = await page.locator(".highlight").first().boundingBox();
  const badge = await page.getByRole("button", { name: /^Key concept:/ }).boundingBox();
  const sheet = await page.getByLabel("Page 1", { exact: true }).boundingBox();

  if (fill === null || badge === null || sheet === null) {
    throw new Error("The highlight, its badge or the page is not laid out.");
  }

  // Just past the end of the highlighted line, and on its row.
  expect(badge.x).toBeGreaterThanOrEqual(fill.x + fill.width - 1);
  expect(badge.x).toBeLessThan(fill.x + fill.width + 24);
  expect(Math.abs(badge.y - fill.y)).toBeLessThan(fill.height + 4);
  // And nowhere near the bottom of the page.
  expect(badge.y).toBeLessThan(sheet.y + sheet.height / 2);
});

test("a highlight can be removed from its badge", async ({ page }) => {
  await highlightHeading(page);

  await page.getByRole("button", { name: /^Key concept:/ }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Remove" }).click();

  await expect(page.locator(".highlight")).toHaveCount(0);
});

test("a highlight can be re-marked from its badge without becoming a new one", async ({
  page,
}) => {
  // Before 2026-11-05 the only way was remove-and-redo, which minted a new id and broke
  // every `cite://` link to it.
  await highlightHeading(page);
  const before = await page.locator(".highlight").first().boundingBox();

  await page.getByRole("button", { name: /^Key concept:/ }).click();

  const menu = page.getByRole("group", MENU);

  await expect(menu.getByRole("button", { name: "Key concept" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await menu.getByRole("button", { name: "Exam / important" }).click();

  // One highlight, in the same place, now marked as an exam point -- colour and letter.
  await expect(page.locator(".highlight")).toHaveCount(1);
  await expect(page.locator(".highlight").first()).toHaveAttribute("data-semantic", "exam");
  await expect(page.getByRole("button", { name: /^Exam \/ important:/ })).toHaveText("E");
  expect(await page.locator(".highlight").first().boundingBox()).toEqual(before);

  // And still that way after the lecture is closed and opened again.
  await page.getByRole("button", { name: "← Vault" }).click();
  await openLecture(page, READING.title);
  await expect(page.locator(".highlight").first()).toHaveAttribute("data-semantic", "exam");
});

test("the menu stays inside the window for text at the right margin", async ({ page }) => {
  // Reported 2026-10-29: a highlight near the right edge opened its menu off the screen.
  await pageField(page).fill("2");
  await settleOn(page, 2);

  await dragAcross(page, textOn(page, 2).filter({ hasText: "Margin" }));

  const menu = await page.getByRole("group", MENU).boundingBox();
  const window = page.viewportSize();

  if (menu === null || window === null) {
    throw new Error("The menu is not laid out.");
  }

  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(window.width);
});

test("the Remove menu stays inside the window for a highlight at the right margin", async ({
  page,
}) => {
  // The case actually reported: the badge sits past the end of the line, so for a word
  // at the margin it is at the page edge, and its menu opened beyond the window.
  await pageField(page).fill("2");
  await settleOn(page, 2);
  await dragAcross(page, textOn(page, 2).filter({ hasText: "Margin" }));
  await page.getByRole("group", MENU).getByRole("button", { name: "Key concept" }).click();

  await page.getByRole("button", { name: /^Key concept: Margin/ }).click();

  const menu = await page.getByRole("group", MENU).boundingBox();
  const window = page.viewportSize();

  if (menu === null || window === null) {
    throw new Error("The menu is not laid out.");
  }

  expect(menu.x + menu.width).toBeLessThanOrEqual(window.width);
  await expect(page.getByRole("group", MENU).getByRole("button", { name: "Remove" })).toBeInViewport({
    ratio: 1,
  });
});

test("the menu closes when the page changes in page mode", async ({ page }) => {
  // Reported 2026-10-29: switching to page mode and paging with the arrows left a Remove
  // button floating over a different page.
  await page.getByRole("button", { name: "Page", exact: true }).click();
  await dragAcross(page, textOn(page, 1).filter({ hasText: "Body text on page 1" }));
  await expect(page.getByRole("group", MENU)).toBeVisible();

  await page.getByRole("button", { name: "Next page" }).click();

  await expect(page.getByRole("group", MENU)).toHaveCount(0);
});

test("the menu closes when the document scrolls", async ({ page }) => {
  await dragAcross(page, textOn(page, 1).filter({ hasText: "Body text on page 1" }));
  await expect(page.getByRole("group", MENU)).toBeVisible();

  await bed(page).hover();
  await page.mouse.wheel(0, 900);

  await expect(page.getByRole("group", MENU)).toHaveCount(0);
});

test("highlights survive closing and reopening the lecture", async ({ page }) => {
  await highlightHeading(page);

  await page.getByRole("button", { name: "← Vault" }).click();
  await openLecture(page, READING.title);

  await expect(page.locator(".highlight")).toHaveCount(1);
});
