/**
 * Callouts and image captions (2026-11-09): a callout from the + or / menu, a tinted box
 * whose kind is chosen from its head, written as GitHub's `> [!NOTE]`; an image's words
 * shown under it.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const NOTES = ["Alpha line", "", "![The leader election](assets/raft.png)", "", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const lines = async (page: Page) => (await saved(page)).split("\n");

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(line(page, "Alpha line")).toBeVisible();
});

test("/callout makes a tinted box, written as GitHub's alert, its kind chosen from its head", async ({ page }) => {
  await line(page, "Alpha line").click();
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/callout");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Revise chapter 3");

  await expect.poll(async () => (await lines(page)).slice(1, 3)).toEqual(["> [!NOTE]", "> Revise chapter 3"]);
  await expect(line(page, "Revise chapter 3")).toHaveClass(/md-callout-note/);
  // The marker is drawn as the head, never as text.
  await expect(notes(page).locator(".cm-content")).not.toContainText("[!NOTE]");

  await notes(page).getByRole("combobox", { name: "Callout kind" }).selectOption("warning");
  await expect.poll(async () => (await lines(page))[1]).toBe("> [!WARNING]");
  await expect(line(page, "Revise chapter 3")).toHaveClass(/md-callout-warning/);
});

test("Backspace at the start of a callout's words makes it a plain quote", async ({ page }) => {
  await line(page, "Alpha line").click();
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/callout");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Hm");
  await page.keyboard.press("Meta+ArrowLeft");
  await page.keyboard.press("Backspace");

  await expect.poll(() => lines(page)).toContain("> Hm");
  expect(await lines(page)).not.toContain("> [!NOTE]");
});

test("an image's words are shown under it as its caption", async ({ page }) => {
  await expect(notes(page).locator(".md-figure img")).toBeVisible();
  await expect(notes(page).locator(".md-caption")).toHaveText("The leader election");
});
