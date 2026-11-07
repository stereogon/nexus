/**
 * The window's layout: what scrolls, what follows the scroll, and what sits beside what.
 *
 * Each case here was a bug reported from looking at the app, and none of them could be
 * caught by the unit suite, because jsdom has no layout engine. That is the reason this
 * suite exists.
 */
import { expect, test } from "@playwright/test";

import { READING } from "./fixture";
import { bed, openLecture, openNexus, pageField, showFolderOf } from "./nexus";

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
});

test("only the document scrolls, not the window around it", async ({ page }) => {
  // Reported 2026-10-29: `.app` had `min-height: 100vh`, so the bed grew to the whole
  // document and the window scrolled instead -- headers, sidebar and all.
  const header = page.locator(".viewer-bar");
  const before = await header.boundingBox();

  await bed(page).hover();
  await page.mouse.wheel(0, 2400);

  await expect.poll(() => bed(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
  expect(await header.boundingBox()).toEqual(before);
});

test("the page counter follows the scroll", async ({ page }) => {
  // The other half of the same bug: scrolling the window moved nothing the viewer
  // watches, so the counter stayed on page 1 whatever was on screen.
  await bed(page).evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight });
  });

  await expect(pageField(page)).toHaveValue("12");
});

test("typing a page number goes to that page in scroll mode", async ({ page }) => {
  // Reported twice before the cause was found. In scroll mode the page is reached by
  // scrolling, and the bed did not scroll.
  await pageField(page).fill("7");

  const seventh = page.getByLabel("Page 7", { exact: true });

  await expect(seventh).toBeInViewport();
  await expect(pageField(page)).toHaveValue("7");

  // At the top of the bed, not merely somewhere on screen.
  const bedTop = (await bed(page).boundingBox())?.y ?? 0;
  const pageTop = (await seventh.boundingBox())?.y ?? Number.NaN;

  expect(Math.abs(pageTop - bedTop)).toBeLessThan(40);
});

test("typing a page number goes to that page in page mode", async ({ page }) => {
  await page.getByRole("button", { name: "Page", exact: true }).click();
  await pageField(page).fill("4");

  await expect(page.getByLabel("Page 4", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Page 1", { exact: true })).toHaveCount(0);
});

test("Escape in the page field goes back to where you were", async ({ page }) => {
  await pageField(page).fill("9");
  await expect(page.getByLabel("Page 9", { exact: true })).toBeInViewport();

  await pageField(page).press("Escape");

  await expect(page.getByLabel("Page 1", { exact: true })).toBeInViewport();
  await expect(pageField(page)).toHaveValue("1");
});

test("the editor opens beside the document rather than instead of it", async ({ page }) => {
  // Reported 2026-10-29: with a lecture open, Edit showed nothing at all.
  await showFolderOf(page, "1. Foundations");
  await page.getByRole("button", { name: "Edit 1. Foundations" }).click();

  const panel = page.getByRole("complementary", { name: "Edit document" });

  await expect(panel).toBeVisible();
  await expect(page.getByLabel("Page 1", { exact: true })).toBeVisible();

  const panelBox = await panel.boundingBox();
  const bedBox = await bed(page).boundingBox();

  if (panelBox === null || bedBox === null) {
    throw new Error("The panel or the document is not laid out.");
  }

  // Beside, not over: the document ends where the panel begins.
  expect(bedBox.x + bedBox.width).toBeLessThanOrEqual(panelBox.x + 1);
  // And the breadcrumb keeps naming the lecture being read, not the one being edited.
  await expect(page.locator(".viewer-bar")).toContainText(READING.title);
});

test("renaming the open lecture renames it on screen", async ({ page }) => {
  await page.getByRole("button", { name: `Edit ${READING.title}` }).click();
  await page.getByLabel("Title").fill("2. The Requirements Engineering Process");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator(".viewer-bar")).toContainText("2. The Requirements Engineering Process");
  await expect(page.locator(".viewer-title")).toHaveText("week-2 /2. The Requirements Engineering Process");
});

test("hiding the sidebar leaves room beside the window's own buttons, and shows it again", async ({ page }) => {
  // With the title bar gone (2026-11-07) the window's buttons sit over the leftmost
  // header; the sidebar's top strip makes room for them, and without it the header must.
  const inset = () => page.locator(".viewer-bar").evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft));

  expect(await inset()).toBeLessThan(40);

  await page.getByRole("button", { name: "Hide sidebar" }).click();

  await expect(page.locator(".sidebar")).toHaveCount(0);
  expect(await inset()).toBeGreaterThanOrEqual(120);

  await page.getByRole("button", { name: "Show sidebar" }).click();

  await expect(page.locator(".sidebar")).toBeVisible();
  expect(await inset()).toBeLessThan(40);
});
