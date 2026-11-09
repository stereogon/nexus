/**
 * A table's columns resized by dragging the edge between them (2026-11-09): the width kept
 * on a comment line above the table, undone in one step, put back by a double-click, and a
 * narrowed column wrapping its words, the row growing to hold them.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const TABLE = ["| Name | Votes |", "| --- | --- |", "| Raft | 3 |", "| Paxos | 5 |"];
const NOTES = ["Alpha line", "", ...TABLE, "", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const cell = (page: Page, name: string) => notes(page).getByRole("textbox", { name, exact: true });
const header = (page: Page, column: number) => notes(page).locator(".md-table-editable th").nth(column);
const widthsLine = async (page: Page) => (await saved(page)).split("\n").find((text) => text.startsWith("<!--")) ?? null;

/** Drags the right edge of column `column` by `by` pixels. */
async function dragEdge(page: Page, column: number, by: number): Promise<void> {
  const box = await header(page, column).boundingBox();
  const x = (box?.x ?? 0) + (box?.width ?? 0);
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by / 2, y);
  await page.mouse.move(x + by, y);
  await page.mouse.up();
}

const widthOf = async (page: Page, column: number) => (await header(page, column).boundingBox())?.width ?? 0;

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(header(page, 0)).toBeVisible();
});

test("dragging a column's edge widens it, keeps the width above the table, and ⌘Z undoes it", async ({ page }) => {
  const start = await widthOf(page, 0);

  await dragEdge(page, 0, 120);

  await expect.poll(() => widthOf(page, 0)).toBeGreaterThan(start + 110);
  await expect.poll(() => widthsLine(page)).toBe(`<!-- column widths: ${String(Math.round(start + 120))} auto -->`);
  // The rest of the table is untouched, and is still a table.
  expect((await saved(page)).split("\n").filter((text) => text.startsWith("|"))).toEqual([
    "| Name  | Votes |",
    "| ----- | ----- |",
    "| Raft  | 3     |",
    "| Paxos | 5     |",
  ]);

  await notes(page).locator(".cm-line").filter({ hasText: "The end." }).click();
  await page.keyboard.press("Meta+z");
  await expect.poll(() => widthsLine(page)).toBeNull();
  await expect.poll(() => widthOf(page, 0)).toBeLessThan(start + 2);
});

test("a cell typed in after resizing edits the table, keeping its widths", async ({ page }) => {
  await dragEdge(page, 1, 80);
  await expect.poll(() => widthsLine(page)).not.toBeNull();
  const kept = await widthsLine(page);

  await cell(page, "Row 1, column 1").click();
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.type(" consensus");

  await expect.poll(async () => (await saved(page)).includes("| Raft consensus |")).toBe(true);
  expect(await widthsLine(page)).toBe(kept);

  // A second column resized joins the same line, rather than adding one.
  await dragEdge(page, 0, 40);
  await expect.poll(() => widthsLine(page)).not.toContain("auto");
  expect((await saved(page)).split("\n").filter((text) => text.startsWith("<!--"))).toHaveLength(1);
});

test("a double-click on the edge puts the column back to fitting its words", async ({ page }) => {
  await dragEdge(page, 0, 100);
  await expect.poll(() => widthsLine(page)).not.toBeNull();

  const box = await header(page, 0).boundingBox();

  await page.mouse.dblclick((box?.x ?? 0) + (box?.width ?? 0), (box?.y ?? 0) + 8);
  await expect.poll(() => widthsLine(page)).toBeNull();
});

test("a narrowed column wraps its words, the row growing, and they stay wrapped while typed in", async ({ page }) => {
  const words = "a long sentence that will not fit in a narrow column";
  const name = cell(page, "Row 1, column 1");

  await name.click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type(words);
  const oneLine = (await header(page, 0).boundingBox())?.height ?? 0;

  await dragEdge(page, 0, -((await widthOf(page, 0)) - 120));
  await expect.poll(() => widthOf(page, 0)).toBeLessThan(130);

  // The row grown to several lines, and the words typed in still wrapped, every one shown.
  await name.click();
  await expect.poll(async () => (await name.locator("xpath=..").boundingBox())?.height ?? 0).toBeGreaterThan(oneLine * 2.5);
  await expect(name).toHaveText(words);
  expect(await name.evaluate((box) => box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1)).toBe(true);
});
