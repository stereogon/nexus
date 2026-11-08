/**
 * Ordinary Markdown rendered in the same view as it is written: the markup hidden on every
 * line but the cursor's, and what it means drawn. Reported 2026-11-05: tables did not
 * render, `>` only dimmed the text, and the notes showed Markdown and preview at once.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const NOTES = [
  "## Consensus",
  "",
  "Raft elects a **leader**; see [the paper](https://raft.github.io/raft.pdf).",
  "",
  "> Consensus is hard in an asynchronous network.",
  "",
  "- first point",
  "  - a nested one",
  "1. numbered",
  "- [ ] read chapter 3",
  "",
  "| Algorithm | Year |",
  "|:----------|-----:|",
  "| **Raft** | 2014 |",
  "| Paxos | 1998 |",
  "",
  "---",
  "",
  "![from the web](https://example.com/figure.png)",
  "",
  "The end.",
].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  // The cursor starts on the first line; park it on the last so every other line renders.
  await line(page, "The end.").click();
});

test("a table is drawn as a table, header and rows", async ({ page }) => {
  const table = notes(page).locator(".md-table table");

  await expect(table).toHaveCount(1);
  await expect(table.locator("th")).toHaveText(["Algorithm", "Year"]);
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table.locator("tbody strong")).toHaveText("Raft");
});

test("clicking into a table edits the cell, and the table stays a table", async ({ page }) => {
  // Until 2026-11-08 the table turned back into its Markdown; now it is edited in place
  // (`tableEditor.spec.ts` covers the editing).
  await notes(page).locator(".md-table td").first().click();

  await expect(notes(page).locator(".md-table table")).toHaveCount(1);
  await expect(notes(page).getByRole("textbox", { name: "Row 1, column 1", exact: true })).toBeFocused();
});

test("a quote has a bar beside it and no > in front of it", async ({ page }) => {
  const quote = line(page, "Consensus is hard");

  await expect(quote).toHaveClass(/md-quote/);
  await expect(quote).not.toContainText(">");
  expect(await quote.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe("3px");
});

test("a heading shows without its # marks", async ({ page }) => {
  await expect(line(page, "Consensus").first()).not.toContainText("#");
});

test("bold shows bold, without its asterisks", async ({ page }) => {
  const sentence = line(page, "Raft elects");

  await expect(sentence).not.toContainText("**");
  expect(await sentence.getByText("leader", { exact: true }).evaluate((element) => getComputedStyle(element).fontWeight)).toMatch(/^(6|7)\d\d$/);
});

test("a link shows its words and not its address", async ({ page }) => {
  const sentence = line(page, "Raft elects");

  await expect(sentence).toContainText("the paper");
  await expect(sentence).not.toContainText("raft.github.io");
});

test("list items show bullets, and a task shows a checkbox that ticks", async ({ page }) => {
  await expect(line(page, "first point").locator(".md-bullet")).toHaveText("•");
  await expect(line(page, "a nested one").locator(".md-bullet")).toHaveText("◦");

  // The box alone, as the canvas draws a to-do: no bullet beside it.
  const box = line(page, "read chapter 3").getByRole("checkbox");

  await expect(line(page, "read chapter 3").locator(".md-bullet")).toHaveCount(0);
  await expect(box).toHaveAttribute("aria-checked", "false");
  await box.click();
  await expect(line(page, "read chapter 3").getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  await expect(line(page, "read chapter 3").locator(".md-done")).toHaveCSS("text-decoration-line", "line-through");
});

test("the line the cursor is on keeps its Markdown hidden, as Notion does", async ({ page }) => {
  // Until 2026-11-07 the cursor's line showed its marks; the user asked for them to stay
  // out of sight while the notes stay Markdown underneath.
  await line(page, "Raft elects").click();

  await expect(line(page, "Raft elects")).not.toContainText("**");
  await expect.poll(() => saved(page)).toContain("**leader**");
});

test("an image from the web is not fetched, and says why", async ({ page }) => {
  // Offline by definition: only the lecture's own assets folder is shown.
  await expect(notes(page).getByText(/Only images in these notes' assets folder are shown/)).toBeVisible();
});
