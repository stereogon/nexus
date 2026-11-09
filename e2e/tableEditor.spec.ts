/**
 * Tables edited where they are drawn (2026-11-08): inserted at a size picked from `+`'s
 * menu, typed into cell by cell, grown and reshaped from the toolbar above them, and kept as
 * ordinary GFM in the notes throughout.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const TABLE = ["| Name | Votes |", "| --- | --- |", "| Raft | 3 |", "| Paxos | 5 |"];
const NOTES = ["Alpha line", "", ...TABLE, "", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const cell = (page: Page, name: string) => notes(page).getByRole("textbox", { name, exact: true });
const tools = (page: Page) => notes(page).getByRole("toolbar", { name: "Table" });
const tableText = async (page: Page) => (await saved(page)).split("\n").filter((text) => text.startsWith("|"));

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(line(page, "Alpha line")).toBeVisible();
});

test("+ Table picks a size, writes it, and puts the cursor in its first heading", async ({ page }) => {
  await line(page, "Alpha line").hover();
  await notes(page).getByRole("button", { name: "Add a line below" }).click();
  await page.getByRole("menu", { name: "Turn into" }).getByRole("menuitem", { name: "Table" }).click();

  const picker = page.getByRole("dialog", { name: "New table" });

  // From 3 × 3: one row down, one column left.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowLeft");
  await expect(picker).toContainText("4 rows × 2 columns");
  await page.keyboard.press("Enter");

  await page.keyboard.type("Term");
  // The new table, before the one the notes started with.
  await expect.poll(async () => (await tableText(page)).slice(0, 5)).toEqual([
    "| Term | Column 2 |",
    "| ---- | -------- |",
    "|      |          |",
    "|      |          |",
    "|      |          |",
  ]);
});

test("typing in a cell writes the table and keeps the cursor in the cell", async ({ page }) => {
  await notes(page).locator("td").filter({ hasText: "Raft" }).click();
  // ⌘→, the Mac's end of the line: End does not move a text box's caret in WebKit.
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.type(" and Zab");

  await expect.poll(() => tableText(page)).toContain("| Raft and Zab | 3     |");
  await expect(cell(page, "Row 1, column 1")).toBeFocused();
});

test("Tab moves on and adds a row at the end; Enter goes down", async ({ page }) => {
  await cell(page, "Row 2, column 2").click();
  await page.keyboard.press("Tab");
  await page.keyboard.type("Zab");

  await expect.poll(() => tableText(page)).toContain("| Zab   |       |");

  await cell(page, "Header, column 1").click();
  await page.keyboard.press("Enter");
  await expect(cell(page, "Row 1, column 1")).toBeFocused();
});

test("the toolbar adds and removes rows and columns, aligns, and turns the header off", async ({ page }) => {
  await cell(page, "Row 1, column 2").click();
  await expect(tools(page)).toBeVisible();

  await tools(page).getByRole("button", { name: "Rows", exact: true }).click();
  await tools(page).getByRole("menuitem", { name: "Add a row below" }).click();
  await expect.poll(async () => (await tableText(page)).length).toBe(5);

  await tools(page).getByRole("button", { name: "Alignment", exact: true }).click();
  await tools(page).getByRole("menuitem", { name: "Centre the column" }).click();
  await expect.poll(async () => (await tableText(page))[1]).toBe("| ----- | :---: |");

  await tools(page).getByRole("button", { name: "Columns", exact: true }).click();
  await tools(page).getByRole("menuitem", { name: "Delete the column" }).click();
  await expect.poll(async () => (await tableText(page))[0]).toBe("| Name  |");

  await tools(page).getByRole("button", { name: "Header row" }).click();
  await expect.poll(async () => (await tableText(page))[0]).toBe("|       |");
  await expect(notes(page).locator(".md-table-editable thead")).toHaveCount(0);
});

test("the toolbar is one row above the table, not covering more than a line", async ({ page }) => {
  await cell(page, "Row 1, column 1").click();

  const bar = await tools(page).boundingBox();

  // One row of controls, as reported on 2026-11-08 when it wrapped onto three.
  expect(bar?.height ?? 0).toBeLessThan(40);
});

test("a toolbar icon opens its options in a strip just above it", async ({ page }) => {
  await cell(page, "Row 2, column 1").click();
  await tools(page).getByRole("button", { name: "Alignment", exact: true }).click();

  const strip = tools(page).getByRole("menu", { name: "Alignment" });
  const opener = await tools(page).getByRole("button", { name: "Alignment", exact: true }).boundingBox();
  const shown = await strip.boundingBox();

  await expect(strip.getByRole("menuitem")).toHaveCount(3);
  expect((shown?.y ?? 0) + (shown?.height ?? 0)).toBeLessThanOrEqual(opener?.y ?? 0);
  // Still in the cell, so the choice is about its column.
  await expect(cell(page, "Row 2, column 1")).toBeFocused();

  await strip.getByRole("menuitem", { name: "Align the column right" }).click();
  await expect(strip).toBeHidden();
  await expect.poll(async () => (await tableText(page))[1]).toBe("| ----: | ----- |");
});

test("⌘Z in a cell undoes what was typed there", async ({ page }) => {
  await notes(page).locator("td").filter({ hasText: "Paxos" }).click();
  // ⌘→, the Mac's end of the line: End does not move a text box's caret in WebKit.
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.type("!");
  await expect.poll(() => tableText(page)).toContain("| Paxos! | 5     |");

  // Back to the table exactly as it was, before the edit padded its columns too.
  await page.keyboard.press("Meta+z");
  await expect.poll(() => tableText(page)).toContain("| Paxos | 5 |");
  await expect(cell(page, "Row 2, column 1")).toHaveText("Paxos");
});

test("Escape leaves the table, and what is typed next goes below it", async ({ page }) => {
  await cell(page, "Row 2, column 2").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("After");

  // A blank line between, or GFM would read the words as another row of the table.
  await expect.poll(async () => (await saved(page)).split("\n").slice(-5)).toEqual(["| Paxos | 5 |", "", "After", "", "The end."]);
});
