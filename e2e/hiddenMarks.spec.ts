/**
 * The notes as Notion writes them (2026-11-07): Markdown underneath, never on screen —
 * `# ` makes a heading and is not seen, Backspace undoes it; ``` opens a code block that can
 * be typed in; a citation is an element, deleted whole; and elements have room around them.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const CITE = '> 📌 **[Page 4](cite://hl-vote)**: *"A candidate wins"*';
const NOTES = ["First line", "", CITE, "After the citation", "", "Last line"].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(line(page, "First line")).toBeVisible();
});

test("# and a space make a heading, with no # to be seen; Backspace makes it text again", async ({ page }) => {
  await line(page, "Last line").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("# Plans");

  const heading = line(page, "Plans");
  await expect(heading).toHaveText("Plans");
  await expect.poll(() => saved(page)).toContain("\n# Plans");

  // At the start of its words, Backspace takes the heading away, not a hidden character.
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await expect.poll(() => saved(page)).toContain("\nPlans");
  await expect.poll(() => saved(page)).not.toContain("# Plans");
});

test("Backspace before a heading with a blank line above moves it up, still a heading", async ({ page }) => {
  await line(page, "Last line").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("# Plans");
  await expect.poll(() => saved(page)).toMatch(/Last line\n\n# Plans$/u);

  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  // The cursor stays at the start of its words, so typing carries on in the heading.
  await page.keyboard.type("New ");
  await expect.poll(() => saved(page)).toMatch(/Last line\n# New Plans$/u);
});

test("← from the start of a heading's words goes up a line, not into its hidden #", async ({ page }) => {
  await line(page, "Last line").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("# Plans");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("!");

  await expect.poll(() => saved(page)).toMatch(/Last line!\n# Plans$/u);
});

test("Backspace at the start of a to-do's words makes it text again, box and all", async ({ page }) => {
  await line(page, "Last line").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- [ ] Milk");
  await expect(notes(page).getByRole("checkbox")).toHaveCount(1);

  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");

  await expect(notes(page).getByRole("checkbox")).toHaveCount(0);
  await expect.poll(() => saved(page)).toMatch(/\nMilk$/u);
});

test("typing ``` opens a closed code block, typed into where the cursor is", async ({ page }) => {
  await line(page, "Last line").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```");
  await page.keyboard.type("let answer = 42;");

  await expect.poll(() => saved(page)).toContain("```\nlet answer = 42;\n```");
  await expect(notes(page).locator(".md-code-line").filter({ hasText: "let answer = 42;" })).toBeVisible();
});

test("a click below a code block's code never lands on its hidden fence", async ({ page }) => {
  await line(page, "Last line").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```");
  await page.keyboard.type("code");

  // The foot of the panel, where the closing fence is.
  const foot = notes(page).locator(".md-code-foot");
  await foot.click({ position: { x: 20, y: 4 } });
  await page.keyboard.type("x");

  // Typed outside the block, never after the closing backticks.
  await expect.poll(() => saved(page)).not.toMatch(/```x|```\S/u);
  await expect.poll(() => saved(page)).toContain("```\ncode\n```");
});

test("Backspace just after a citation removes it whole", async ({ page }) => {
  await line(page, "After the citation").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");

  await expect(notes(page).locator(".md-citation")).toHaveCount(0);
  await expect.poll(() => saved(page)).toBe(["First line", "", "After the citation", "", "Last line"].join("\n"));
});

test("a code block has room around it, so what follows is not drawn against it", async ({ page }) => {
  await line(page, "Last line").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```");
  await page.keyboard.type("code");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("Next");

  const foot = await notes(page).locator(".md-code-foot").boundingBox();
  const next = await line(page, "Next").boundingBox();

  expect((next?.y ?? 0) - ((foot?.y ?? 0) + (foot?.height ?? 0))).toBeGreaterThanOrEqual(10);
});

test("⋮⋮ offers no Turn into for a citation, and never the kind a line already is", async ({ page }) => {
  const grip = notes(page).getByRole("button", { name: "Move this block, or open its menu" });
  const menu = page.getByRole("menu", { name: "Block" });

  await notes(page).locator(".md-citation").hover();
  await grip.click();
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Turn into/u })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await line(page, "First line").hover();
  await grip.click();
  await expect(menu.getByRole("menuitem", { name: "Turn into heading 1" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Turn into text" })).toHaveCount(0);
});
