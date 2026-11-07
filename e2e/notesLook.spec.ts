/**
 * How the notes read, from the redesign canvas (2026-11-07): the item's title and a line
 * under it above the writing, and a citation drawn as a card.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const NOTES = ["Raft splits consensus into three pieces.", "", '> 📌 **[Page 4](cite://hl-vote)**: *"A candidate wins with votes from a majority"*', "", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(notes(page).locator(".md-page-title")).toBeVisible();
});

test("the notes begin with the item's title and when it was made", async ({ page }) => {
  await expect(notes(page).locator(".md-page-title")).toHaveText(READING.title);
  await expect(notes(page).locator(".md-page-meta")).toHaveText("Created 1 November 2026");

  // Above the writing, and not part of it: the notes' first line is still the first line.
  const title = await notes(page).locator(".md-page-title").boundingBox();
  const first = await notes(page).locator(".cm-line").first().boundingBox();
  expect((title?.y ?? 0) + (title?.height ?? 0)).toBeLessThanOrEqual(first?.y ?? 0);
  await expect(notes(page).locator(".cm-line").first()).toHaveText("Raft splits consensus into three pieces.");
});

test("renaming the item renames the notes' title in place", async ({ page }) => {
  await page.getByRole("button", { name: `Edit ${READING.title}` }).click();
  await page.getByRole("complementary", { name: "Edit document" }).getByLabel("Title").fill("Raft, revised");
  await page.getByRole("complementary", { name: "Edit document" }).getByRole("button", { name: "Save" }).click();

  await expect(notes(page).locator(".md-page-title")).toHaveText("Raft, revised");
});

test("a citation is a card: a pinned page above the quote, in italics", async ({ page }) => {
  const card = notes(page).locator(".md-citation");

  await expect(card.getByRole("button", { name: "Page 4" })).toBeVisible();
  await expect(card.locator(".md-citation-page svg")).toHaveCount(1);
  await expect(card.locator(".md-citation-quote")).toHaveText("“A candidate wins with votes from a majority”");
  await expect(card.locator(".md-citation-quote")).toHaveCSS("font-style", "italic");

  // A card all round, not a bar down one side, with the quote below the page.
  await expect(card).toHaveCSS("border-left-width", "1px");
  const pageBox = await card.getByRole("button", { name: "Page 4" }).boundingBox();
  const quoteBox = await card.locator(".md-citation-quote").boundingBox();
  expect(quoteBox?.y ?? 0).toBeGreaterThan(pageBox?.y ?? 0);
});
