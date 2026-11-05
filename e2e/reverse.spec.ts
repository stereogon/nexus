/**
 * From a highlight to the notes citing it (`claude-spec.md` §2.4, reverse lookup): the
 * indicator beside a cited highlight's badge scrolls the notes to the citation and flashes
 * that line.
 */
import { expect, test, type Page } from "@playwright/test";

import type { Annotation } from "../src/ipc/annotations";
import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, pageField, settleOn } from "./nexus";

const filler = (from: number, count: number) =>
  Array.from({ length: count }, (_, at) => `Filler paragraph ${String(from + at)}.`);

const NOTES = [
  "# Week 2",
  ...filler(1, 60),
  '> 📌 **[Page 4](cite://hl-cited)**: *"Body text on page 4"*',
  ...filler(61, 60),
  "> 📌 **[Page 4](cite://hl-cited)**",
  "The end.",
].join("\n");

function highlight(id: string, y: number): Annotation {
  return {
    kind: "textHighlight",
    id,
    page: 4,
    semantic: "key",
    quote: id,
    rects: [{ x: 0.05, y, width: 0.4, height: 0.06 }],
    createdAt: "2026-11-05T09:00:00.000Z",
    updatedAt: "2026-11-05T09:00:00.000Z",
  };
}

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const toNotes = (page: Page) => page.getByRole("button", { name: "Show where this is cited in the notes" });

test.beforeEach(async ({ page }) => {
  await openNexus(page, {
    ...standardFixture(),
    notes: { [READING.directory]: NOTES },
    annotations: { [READING.directory]: [highlight("hl-cited", 0.28), highlight("hl-plain", 0.6)] },
  });
  await openLecture(page, READING.title);
  await pageField(page).fill("4");
  await settleOn(page, 4);
});

test("only a highlight the notes cite has the way to them", async ({ page }) => {
  await expect(page.locator(".highlight")).toHaveCount(2);
  await expect(toNotes(page)).toHaveCount(1);
});

test("the indicator scrolls the notes to the citation and flashes its line", async ({ page }) => {
  const first = notes(page).locator(".md-citation").filter({ hasText: "Body text on page 4" });

  await expect(first).not.toBeInViewport();

  await toNotes(page).click();

  await expect(first).toBeInViewport();

  const lit = notes(page).locator(".cm-line.md-flash-a, .cm-line.md-flash-b");

  await expect(lit).toHaveCount(1);
  // The class is not enough: the animation it names must exist, or the line never lights.
  expect(await lit.evaluate((line) => getComputedStyle(line).animationName)).toMatch(/md-flash/);
});

test("pressing it again moves on to the next citation", async ({ page }) => {
  await toNotes(page).click();
  await expect(notes(page).locator(".md-citation").filter({ hasText: "Body text on page 4" })).toBeInViewport();

  await toNotes(page).click();

  await expect(notes(page).getByText("Filler paragraph 120.")).toBeInViewport();
});

test("with the notes hidden, it opens them at the citation", async ({ page }) => {
  await notes(page).getByRole("button", { name: "Hide notes" }).click();
  await expect(notes(page)).toBeHidden();

  await toNotes(page).click();

  await expect(notes(page)).toBeVisible();
  await expect(notes(page).locator(".md-citation").filter({ hasText: "Body text on page 4" })).toBeInViewport();
});

test("citing a highlight in the notes gives it the way there, as you type", async ({ page }) => {
  // The last line is far down a long note and not yet in the page, so it is reached from
  // the keyboard rather than clicked.
  await notes(page).locator(".cm-content").click();
  await page.keyboard.press("Meta+End");
  await page.keyboard.type(" See cite://hl-plain");

  await expect(toNotes(page)).toHaveCount(2);
});
