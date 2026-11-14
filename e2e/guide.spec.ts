/**
 * The Markdown guide the user pasted on 2026-11-05, kept verbatim as a fixture, checked
 * section by section. It came from markdownlivepreview.com, so its image points at a path
 * on that site's server: here it must be recognised and explained, not silently left as
 * raw text, which is what it was.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const GUIDE = [
  "# Markdown syntax guide",
  "",
  "## Headers",
  "",
  "# This is a Heading h1",
  "## This is a Heading h2",
  "###### This is a Heading h6",
  "",
  "## Emphasis",
  "",
  "*This text will be italic*  ",
  "_This will also be italic_",
  "",
  "**This text will be bold**  ",
  "__This will also be bold__",
  "",
  "_You **can** combine them_",
  "",
  "## Lists",
  "",
  "### Unordered",
  "",
  "* Item 1",
  "* Item 2",
  "* Item 2a",
  "* Item 2b",
  "    * Item 3a",
  "    * Item 3b",
  "",
  "### Ordered",
  "",
  "1. Item 1",
  "2. Item 2",
  "3. Item 3",
  "    1. Item 3a",
  "    2. Item 3b",
  "",
  "## Images",
  "",
  '![This is an alt text.](/image/Markdown-mark.svg "This is a sample image.")',
  "",
  "## Links",
  "",
  "You may be using [Markdown Live Preview](https://markdownlivepreview.com/).",
  "",
  "## Blockquotes",
  "",
  "Markdown is a lightweight markup language with plain-text-formatting syntax, created in 2004 by John Gruber with Aaron Swartz.",
  "Markdown is often used to format readme files, for writing messages in online discussion forums, and to create rich text using a plain text editor.",
  "",
  "## Tables",
  "",
  "| Left columns  | Right columns |",
  "| ------------- |:-------------:|",
  "| left foo      | right foo     |",
  "| left bar      | right bar     |",
  "| left baz      | right baz     |",
  "",
  "## Blocks of code",
  "",
  "```",
  "let message = 'Hello world';",
  "alert(message);",
  "```",
  "",
  "## Mermaid diagrams",
  "```mermaid",
  "graph TD",
  "  A[Start] --> B{Decision}",
  "  B -->|Yes| C[Finish]",
  "  B -->|No| D[Alternate]",
  "```",
  "",
  "## Inline code",
  "",
  "This web site is using `markedjs/marked`.",
  "",
  "",
  "$E = mc^2$ ",
  "",
  "> 📌 **[Page 1](cite://18e5242cc2079340000076480012)**",
  "",
  "",
].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });

/**
 * Scrolls the notes to their top without moving the cursor. CodeMirror only puts lines
 * near the visible area into the page, so with the cursor parked at the end of a long note
 * the first sections are not there to check until they are scrolled to.
 */
async function showTop(page: Page): Promise<void> {
  await notes(page).locator(".cm-scroller").evaluate((scroller) => {
    scroller.scrollTop = 0;
  });
  await expect(line(page, "Markdown syntax guide")).toBeVisible();
}

/** Scrolls the notes to their end, for the last sections, as `showTop` does for the first. */
async function showEnd(page: Page): Promise<void> {
  await notes(page).locator(".cm-scroller").evaluate((scroller) => {
    scroller.scrollTop = scroller.scrollHeight;
  });
  await expect(line(page, "This web site is using")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: GUIDE } });
  await openLecture(page, READING.title);
  // Park the cursor on the last, empty line so every line above it renders.
  await notes(page).locator(".cm-line").last().click();
});

test("headings render without their marks, at every level", async ({ page }) => {
  await showTop(page);

  for (const heading of ["This is a Heading h1", "This is a Heading h2", "This is a Heading h6"]) {
    await expect(line(page, heading)).not.toContainText("#");
  }
});

test("emphasis renders with stars and underscores alike", async ({ page }) => {
  await showTop(page);

  for (const text of ["This text will be italic", "This will also be italic", "This text will be bold", "This will also be bold"]) {
    await expect(line(page, text)).not.toContainText("*");
    await expect(line(page, text)).not.toContainText("_");
  }
});

test("both lists render: bullets for unordered, numbers for ordered, nested", async ({ page }) => {
  await expect(line(page, "Item 2b").locator(".md-bullet")).toHaveText("•");
  await expect(line(page, "Item 3a").first().locator(".md-bullet")).toHaveText("◦");
  // An ordered list nested one level counts in letters (2026-11-14).
  await expect(line(page, "Item 3b").last().locator(".md-number")).toHaveText("b.");
});

test("the image is recognised and explained, naming its path", async ({ page }) => {
  // It points at a file on markdownlivepreview.com's server, not in this lecture.
  await expect(notes(page).getByText(/“\/image\/Markdown-mark\.svg” is not in it/)).toBeVisible();
  await expect(line(page, "Markdown-mark")).not.toContainText("![");
});

test("the link renders as its words", async ({ page }) => {
  await expect(line(page, "You may be using")).toContainText("Markdown Live Preview");
  await expect(line(page, "You may be using")).not.toContainText("markdownlivepreview.com");
});

test("the table renders, with its centred column", async ({ page }) => {
  const table = notes(page).locator(".md-table table");

  await expect(table.locator("th")).toHaveText(["Left columns", "Right columns"]);
  await expect(table.locator("tbody tr")).toHaveCount(3);
  expect(await table.locator("tbody td").nth(1).evaluate((cell) => getComputedStyle(cell).textAlign)).toBe("center");
});

test("the code block is set as code", async ({ page }) => {
  await expect(line(page, "let message")).toHaveClass(/md-code-line/);
});

test("the diagram, the inline code, the formula and the citation all render", async ({ page }) => {
  await showEnd(page);
  await expect(notes(page).locator(".md-diagram svg")).toHaveCount(1, { timeout: 15_000 });
  await expect(line(page, "This web site is using")).not.toContainText("`");
  await expect(notes(page).locator(".md-math .katex")).toHaveCount(1);
  await expect(notes(page).locator(".md-citation")).toContainText("Page 1");
});
