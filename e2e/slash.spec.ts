/**
 * The "/" menu (2026-11-09): typed at the start of a line or after a space, narrowed by
 * what follows, chosen with the arrows and Enter, closed by Escape.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const menu = (page: Page) => page.getByRole("listbox", { name: "Insert a block" });
const lines = async (page: Page) => (await saved(page)).split("\n");

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: ["Alpha line", "", "The end."].join("\n") } });
  await openLecture(page, READING.title);
  await line(page, "Alpha line").click();
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.press("Enter");
});

test("/ opens the blocks, typing narrows them, ↓ and Enter choose", async ({ page }) => {
  await page.keyboard.type("/");
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole("option")).toHaveCount(15);

  await page.keyboard.type("head");
  await expect(menu(page).getByRole("option")).toHaveText(["Heading 1", "Heading 2", "Heading 3"]);
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("option", { name: "Heading 2" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");

  await expect(menu(page)).toHaveCount(0);
  await page.keyboard.type("Plan");
  await expect.poll(() => lines(page)).toContain("## Plan");
});

test("/ after words turns that line into the block, keeping the words", async ({ page }) => {
  await page.keyboard.type("Buy milk /to-do");
  await page.keyboard.press("Enter");

  await expect.poll(() => lines(page)).toContain("- [ ] Buy milk ");
});

test("a block that fills a line goes on a new one, so the words before / stay", async ({ page }) => {
  await page.keyboard.type("Example /code");
  await page.keyboard.press("Enter");
  await page.keyboard.type("let x = 1;");

  await expect.poll(async () => (await lines(page)).slice(1, 5)).toEqual(["Example ", "```", "let x = 1;", "```"]);
});

test("Escape closes the menu and keeps what was typed", async ({ page }) => {
  await page.keyboard.type("/quo");
  await page.keyboard.press("Escape");

  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => lines(page)).toContain("/quo");
});

test("a / inside a word does not open it", async ({ page }) => {
  await page.keyboard.type("and/or");

  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => lines(page)).toContain("and/or");
});
