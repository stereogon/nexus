/**
 * A table cell keeps its formatting while it is edited (2026-11-09), as the rest of the
 * notes do: no `**` appears when the cell is clicked or its words selected, typing inside
 * bold words keeps them bold, and the notes still hold the Markdown.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const TABLE = ["| Topic | Finding |", "| --- | --- |", "| Novelty | fed **ambiguity** and *doubt* |"];
const NOTES = ["Alpha line", "", ...TABLE, "", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const finding = (page: Page) => notes(page).getByRole("textbox", { name: "Row 1, column 2", exact: true });

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(finding(page)).toBeVisible();
});

test("clicking and selecting in a cell shows its words formatted, never the marks", async ({ page }) => {
  await finding(page).click();
  await page.keyboard.press("Meta+a");

  await expect(finding(page)).toBeFocused();
  await expect(finding(page)).toHaveText("fed ambiguity and doubt");
  await expect(finding(page).locator("strong")).toHaveText("ambiguity");
  await expect(finding(page).locator("em")).toHaveText("doubt");
});

test("typing inside bold words keeps them bold, in the cell and in the notes", async ({ page }) => {
  const bold = finding(page).locator("strong");
  const box = await bold.boundingBox();

  // Between "ambig" and "uity", near the middle of the bold word.
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await page.keyboard.type("X");

  await expect(bold).toContainText("X");
  await expect.poll(async () => (await saved(page)).includes("| Novelty | fed **ambiXguity** and *doubt* |")).toBe(true);
  // Still formatted after the notes were rewritten.
  await expect(finding(page)).not.toContainText("**");
});

test("pasting into a cell adds the words as plain text, on one line", async ({ page }) => {
  await finding(page).click();
  await page.keyboard.press("Meta+ArrowRight");
  await finding(page).evaluate((cell) => {
    const data = new DataTransfer();

    data.setData("text/plain", " one\ntwo");
    cell.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });

  const row = async () => (await saved(page)).split("\n").filter((text) => text.startsWith("| Novelty"));

  await expect.poll(async () => (await row()).join("\n")).toContain("one two");
  expect(await row()).toHaveLength(1);
  expect((await saved(page)).split("\n").filter((text) => text.startsWith("|"))).toHaveLength(3);
});
