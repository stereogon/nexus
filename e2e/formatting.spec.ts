/**
 * Formatting in the notes, Notion-style (2026-11-05): a bar over a selection and the
 * matching shortcuts, writing plain Markdown underneath. And code blocks drawn as panels.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const NOTES = [
  "Raft elects a leader by majority.",
  "second line",
  "",
  "```js",
  "let message = 'Hello';",
  "```",
  "",
  "```",
  "plain block",
  "```",
  "",
  "Use `inline` code.",
  "",
  "The end.",
].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const bar = (page: Page) => page.getByRole("toolbar", { name: "Format" });

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
});

/** Selects "majority" on the first line. */
async function selectWord(page: Page): Promise<void> {
  await line(page, "Raft elects").click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Alt+Shift+ArrowLeft");
}

const source = (page: Page) => notes(page).locator(".cm-content");

test("the bar offers formatting over a selection, and bold writes **", async ({ page }) => {
  await selectWord(page);
  await bar(page).getByRole("button", { name: "Bold" }).click({ delay: 150 });

  await expect(source(page)).toContainText("**majority**");
  // The words stay selected, so the bar stays, showing bold pressed.
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
});

test("formats combine without selecting again, as in Notion", async ({ page }) => {
  await selectWord(page);
  await bar(page).getByRole("button", { name: "Bold" }).click({ delay: 150 });
  await bar(page).getByRole("button", { name: "Italic" }).click({ delay: 150 });

  await expect(source(page)).toContainText("**_majority_**");
});

test("pressing a format again takes it off", async ({ page }) => {
  await selectWord(page);
  await bar(page).getByRole("button", { name: "Bold" }).click({ delay: 150 });
  await bar(page).getByRole("button", { name: "Bold" }).click({ delay: 150 });

  await expect(source(page)).toContainText("Raft elects a leader by majority.");
  await expect(source(page)).not.toContainText("**");
});

test("the shortcuts do the same: ⌘B bold, ⌘I italic, ⌘E code", async ({ page }) => {
  await selectWord(page);
  await page.keyboard.press("Meta+B");
  await page.keyboard.press("Meta+I");
  await page.keyboard.press("Meta+E");

  await expect(source(page)).toContainText("**_`majority`_**");
});

test("a heading button turns the line into a heading, and back", async ({ page }) => {
  await selectWord(page);
  await bar(page).getByRole("button", { name: "Heading 2" }).click({ delay: 150 });

  await expect(source(page)).toContainText("## Raft elects");

  await bar(page).getByRole("button", { name: "Heading 2" }).click({ delay: 150 });
  await expect(source(page)).not.toContainText("## Raft");
});

test("a list button numbers every selected line", async ({ page }) => {
  await line(page, "Raft elects").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+End");
  await bar(page).getByRole("button", { name: "Numbered list" }).click({ delay: 150 });

  await expect(line(page, "Raft elects")).toContainText("1. Raft elects");
  await expect(line(page, "second line")).toContainText("2. second line");
});

test("a link wraps the words and leaves the cursor for the address", async ({ page }) => {
  await selectWord(page);
  await page.keyboard.press("Meta+K");
  await page.keyboard.type("https://raft.github.io");

  await expect(source(page)).toContainText("[majority](https://raft.github.io)");
});

test("a code block is a panel: fences hidden, its language in a menu, code coloured", async ({ page }) => {
  await line(page, "The end.").click();

  const block = line(page, "let message");

  await expect(block).toHaveClass(/md-code-line/);
  await expect(notes(page)).not.toContainText("```");
  // Each block's header reads back its language: the first is JavaScript, the second plain.
  const languages = notes(page).getByRole("combobox", { name: "Code language" });
  await expect(languages.nth(0)).toHaveValue("js");
  await expect(languages.nth(1)).toHaveValue("");

  // The keyword is coloured differently from the plain text beside it.
  const keyword = await block.getByText("let", { exact: true }).evaluate((element) => getComputedStyle(element).color);
  const plain = await block.evaluate((element) => getComputedStyle(element).color);

  expect(keyword).not.toBe(plain);
});

test("only inline code gets a chip, never the text inside a block", async ({ page }) => {
  await line(page, "The end.").click();

  await expect(line(page, "Use").locator(".md-inline-code")).toHaveCount(1);
  await expect(line(page, "plain block").locator(".md-inline-code")).toHaveCount(0);
});
