/**
 * Notion's handles in the notes (2026-11-07): + and ⋮⋮ beside the line under the pointer,
 * and the headings as dashes down the right edge.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const FILLER = Array.from({ length: 40 }, (_, at) => `Filler line ${String(at + 1)}.`);
const NOTES = ["Alpha line", "Beta line", "Gamma line", "", "# First", ...FILLER, "## Second", ...FILLER, "## Third", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
// The notes as saved: the Markdown itself, since the window hides its marks.
const source = async (page: Page) => (await saved(page)).split("\n");

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(line(page, "Alpha line")).toBeVisible();
});

test("hovering a line shows its handle, and + adds a line below it, asking what it is", async ({ page }) => {
  await line(page, "Alpha line").hover();

  await expect(notes(page).getByRole("button", { name: "Move this block, or open its menu" })).toBeVisible();
  await notes(page).getByRole("button", { name: "Add a line below" }).click();

  const menu = page.getByRole("menu", { name: "Turn into" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "To-do list" }).click();
  await expect(menu).toHaveCount(0);
  await page.keyboard.type("Inserted");

  await expect.poll(async () => {
    const lines = await source(page);

    return lines.indexOf("- [ ] Inserted") - lines.indexOf("Alpha line");
  }).toBe(1);
});

test("typing after + leaves the menu behind and the new line plain", async ({ page }) => {
  await line(page, "Beta line").hover();
  await notes(page).getByRole("button", { name: "Add a line below" }).click();
  await expect(page.getByRole("menu", { name: "Turn into" })).toBeVisible();

  await page.keyboard.type("Plain words");

  await expect(page.getByRole("menu", { name: "Turn into" })).toHaveCount(0);
  await expect.poll(async () => {
    const lines = await source(page);

    return lines.indexOf("Plain words") - lines.indexOf("Beta line");
  }).toBe(1);
});

test("+ can start a code block, whose language menu changes its colouring", async ({ page }) => {
  await line(page, "Gamma line").hover();
  await notes(page).getByRole("button", { name: "Add a line below" }).click();
  await page.getByRole("menu", { name: "Turn into" }).getByRole("menuitem", { name: "Code" }).click();
  await page.keyboard.type("let answer = 42;");
  // Off the block's fences, its header shows: the language menu and Copy.
  await line(page, "Alpha line").click();

  const language = notes(page).getByRole("combobox", { name: "Code language" });
  await expect(language).toHaveValue("");
  await language.selectOption("ts");

  // The header is drawn again from the rewritten fence, so it reads back as TypeScript.
  await expect(notes(page).getByRole("combobox", { name: "Code language" })).toHaveValue("ts");
  // TypeScript colouring: the keyword is drawn as one.
  await expect(notes(page).locator(".md-code-line").filter({ hasText: "let answer" }).locator("span").first()).not.toHaveCSS(
    "color",
    "rgb(28, 27, 25)",
  );
  await expect(notes(page).getByRole("button", { name: "Copy" })).toBeVisible();
});

test("dragging ⋮⋮ moves the line, and the move is saved", async ({ page }) => {
  await line(page, "Gamma line").hover();

  const grip = notes(page).getByRole("button", { name: "Move this block, or open its menu" });
  const from = await grip.boundingBox();
  const target = await line(page, "Alpha line").boundingBox();

  if (from === null || target === null) {
    throw new Error("The handle or the target line is not laid out.");
  }

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, target.y + 3, { steps: 8 });
  await expect(notes(page).locator(".block-drop")).toBeVisible();
  await page.mouse.up();

  await expect.poll(async () => (await source(page)).slice(0, 3)).toEqual(["Gamma line", "Alpha line", "Beta line"]);
  await expect(notes(page).locator(".notes-status")).toHaveText("Saved");
});

test("clicking ⋮⋮ opens the block's menu: turn it into a heading, duplicate it, delete it", async ({ page }) => {
  const grip = notes(page).getByRole("button", { name: "Move this block, or open its menu" });
  const menu = page.getByRole("menu", { name: "Block" });

  await line(page, "Beta line").hover();
  await grip.click();
  await menu.getByRole("menuitem", { name: "Turn into heading 2" }).click();
  await expect.poll(() => source(page)).toContain("## Beta line");

  await line(page, "Alpha line").hover();
  await grip.click();
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect.poll(async () => (await source(page)).filter((text) => text === "Alpha line")).toHaveLength(2);

  await line(page, "Gamma line").hover();
  await grip.click();
  await menu.getByRole("menuitem", { name: "Delete" }).click();
  await expect.poll(() => source(page)).not.toContain("Gamma line");
});

test("the headings run down the right edge, follow the reading, and take you there", async ({ page }) => {
  const rail = notes(page).getByRole("navigation", { name: "Headings" });
  const dashes = rail.locator(".heading-dash");

  await expect(dashes).toHaveCount(3);
  await expect(dashes.nth(0)).toHaveAttribute("data-current", "true");

  await rail.hover();
  await rail.getByRole("button", { name: "Third" }).click();

  await expect(line(page, "The end.")).toBeInViewport();
  await expect(dashes.nth(2)).toHaveAttribute("data-current", "true");
});
