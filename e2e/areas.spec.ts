/**
 * Area highlights: a box drawn with Option held, for diagrams, equations and scans —
 * the parts of a slide with no text to select (`claude-spec.md` §2.3).
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { openLecture, openNexus, textOn } from "./nexus";

const MENU = { name: "Highlight as" } as const;

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
});

/** The fractions of page 1 a drag runs between, and the pixel box that makes. */
async function dragOnFirstPage(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  withOption = true,
): Promise<{ left: number; top: number; width: number; height: number }> {
  const sheet = await page.getByLabel("Page 1", { exact: true }).boundingBox();

  if (sheet === null) {
    throw new Error("Page 1 is not laid out.");
  }

  const start = { x: sheet.x + sheet.width * from.x, y: sheet.y + sheet.height * from.y };
  const end = { x: sheet.x + sheet.width * to.x, y: sheet.y + sheet.height * to.y };

  if (withOption) {
    await page.keyboard.down("Alt");
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();

  if (withOption) {
    await page.keyboard.up("Alt");
  }

  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

const EMPTY_CORNER = { from: { x: 0.55, y: 0.5 }, to: { x: 0.9, y: 0.9 } } as const;

test("an Option-drag becomes an area highlight where the box was drawn", async ({ page }) => {
  const drawn = await dragOnFirstPage(page, EMPTY_CORNER.from, EMPTY_CORNER.to);

  await page.getByRole("group", MENU).getByRole("button", { name: "Definition" }).click();

  const fill = page.locator('.highlight[data-semantic="definition"]');

  await expect(fill).toHaveCount(1);

  const box = await fill.boundingBox();

  if (box === null) {
    throw new Error("The area highlight is not laid out.");
  }

  // Where it was drawn, to within the rounding of a normalised round trip.
  expect(Math.abs(box.x - drawn.left)).toBeLessThan(3);
  expect(Math.abs(box.y - drawn.top)).toBeLessThan(3);
  expect(Math.abs(box.width - drawn.width)).toBeLessThan(3);
  expect(Math.abs(box.height - drawn.height)).toBeLessThan(3);
  await expect(page.getByRole("button", { name: "Definition", exact: true })).toHaveText("D");
});

test("the box stays outlined while its meaning is chosen, and then goes", async ({ page }) => {
  await dragOnFirstPage(page, EMPTY_CORNER.from, EMPTY_CORNER.to);

  await expect(page.locator(".area-outline")).toBeVisible();

  await page.getByRole("group", MENU).getByRole("button", { name: "Key concept" }).click();

  await expect(page.locator(".area-outline")).toHaveCount(0);
});

test("Escape abandons a drawn box without storing it", async ({ page }) => {
  await dragOnFirstPage(page, EMPTY_CORNER.from, EMPTY_CORNER.to);
  await expect(page.getByRole("group", MENU)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("group", MENU)).toHaveCount(0);
  await expect(page.locator(".area-outline")).toHaveCount(0);
  await expect(page.locator(".highlight")).toHaveCount(0);
});

test("an Option-click is not a box", async ({ page }) => {
  // A stray click with Option held must not leave a tiny highlight behind.
  await dragOnFirstPage(page, { x: 0.6, y: 0.6 }, { x: 0.601, y: 0.601 });

  await expect(page.getByRole("group", MENU)).toHaveCount(0);
  await expect(page.locator(".highlight")).toHaveCount(0);
});

test("Option over text draws a box rather than selecting the text", async ({ page }) => {
  const heading = await textOn(page, 1).filter({ hasText: "Page 1 heading" }).boundingBox();
  const sheet = await page.getByLabel("Page 1", { exact: true }).boundingBox();

  if (heading === null || sheet === null) {
    throw new Error("Page 1 is not laid out.");
  }

  await dragOnFirstPage(
    page,
    { x: (heading.x - sheet.x - 4) / sheet.width, y: (heading.y - sheet.y - 4) / sheet.height },
    {
      x: (heading.x + heading.width - sheet.x + 4) / sheet.width,
      y: (heading.y + heading.height - sheet.y + 4) / sheet.height,
    },
  );

  expect(await page.evaluate(() => document.getSelection()?.toString() ?? "")).toBe("");

  await page.getByRole("group", MENU).getByRole("button", { name: "Exam / important" }).click();

  // An area, so its badge names the meaning alone: there is no quote to read out.
  await expect(page.getByRole("button", { name: "Exam / important", exact: true })).toBeVisible();
});

test("a plain drag still selects text, with Option up", async ({ page }) => {
  const words = textOn(page, 1).filter({ hasText: "Page 1 heading" });
  const box = await words.boundingBox();

  if (box === null) {
    throw new Error("The heading is not laid out.");
  }

  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  expect(await page.evaluate(() => document.getSelection()?.toString() ?? "")).toBe(
    "Page 1 heading",
  );
  await expect(page.locator(".area-outline")).toHaveCount(0);
});

test("an area can be re-marked and removed from its badge", async ({ page }) => {
  await dragOnFirstPage(page, EMPTY_CORNER.from, EMPTY_CORNER.to);
  await page.getByRole("group", MENU).getByRole("button", { name: "Key concept" }).click();

  await page.getByRole("button", { name: "Key concept", exact: true }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Question" }).click();
  await expect(page.locator('.highlight[data-semantic="question"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Question", exact: true }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".highlight")).toHaveCount(0);
});

test("an area survives closing and reopening the lecture", async ({ page }) => {
  await dragOnFirstPage(page, EMPTY_CORNER.from, EMPTY_CORNER.to);
  await page.getByRole("group", MENU).getByRole("button", { name: "Definition" }).click();
  await expect(page.locator(".highlight")).toHaveCount(1);

  await page.getByRole("button", { name: "← Vault" }).click();
  await openLecture(page, READING.title);

  await expect(page.locator('.highlight[data-semantic="definition"]')).toHaveCount(1);
});

test("with the box tool on, a plain drag draws a box -- for a touchpad", async ({ page }) => {
  // Option-drag needs a physical click held while the finger moves, which most touchpad
  // setups make awkward. Reported 2026-11-05.
  await page.getByRole("button", { name: "Draw a box" }).click();

  await dragOnFirstPage(page, EMPTY_CORNER.from, EMPTY_CORNER.to, false);
  await page.getByRole("group", MENU).getByRole("button", { name: "Definition" }).click();

  await expect(page.locator('.highlight[data-semantic="definition"]')).toHaveCount(1);
});

test("the box tool stays on for the next box, and off means text again", async ({ page }) => {
  const tool = page.getByRole("button", { name: "Draw a box" });

  await tool.click();
  await dragOnFirstPage(page, { x: 0.55, y: 0.5 }, { x: 0.7, y: 0.7 }, false);
  await page.getByRole("group", MENU).getByRole("button", { name: "Key concept" }).click();
  await dragOnFirstPage(page, { x: 0.75, y: 0.5 }, { x: 0.9, y: 0.7 }, false);
  await page.getByRole("group", MENU).getByRole("button", { name: "Question" }).click();
  await expect(page.locator(".highlight")).toHaveCount(2);

  await tool.click();
  await expect(tool).toHaveAttribute("aria-pressed", "false");

  const words = textOn(page, 1).filter({ hasText: "Page 1 heading" });
  const box = await words.boundingBox();

  if (box === null) {
    throw new Error("The heading is not laid out.");
  }

  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  expect(await page.evaluate(() => document.getSelection()?.toString() ?? "")).toBe(
    "Page 1 heading",
  );
});
