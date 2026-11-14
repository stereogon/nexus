/**
 * Lists in the notes (2026-11-14, at the user's request): a wrapped item's words line up
 * after its marker, not under it; a nested item sits one marker's width in; and a numbered
 * list nested with Tab counts a, b, c, its digits written from 1.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const LONG = "one which is a long bullet that will certainly wrap onto a second line in this pane";

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });

async function open(page: Page, text: string): Promise<void> {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: text } });
  await openLecture(page, READING.title);
}

/** Where each visual line of a list line's words starts, from the text after its marker. */
function wordStarts(page: Page, text: string): Promise<number[]> {
  return line(page, text).evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.textContent?.includes(wanted) === true) {
        range.selectNodeContents(node);
      }
    }
    return [...range.getClientRects()].map((rect) => Math.round(rect.left));
  }, text);
}

test("a wrapped item's words line up after its marker, and a nested one sits a step in", async ({ page }) => {
  await open(page, `- ${LONG}\n  - nested\n- after`);

  const starts = await wordStarts(page, LONG);

  expect(starts.length).toBeGreaterThan(1);
  expect(new Set(starts).size).toBe(1);

  const top = await line(page, "after").locator(".md-bullet").boundingBox();
  const nested = await line(page, "nested").locator(".md-bullet").boundingBox();

  expect((nested?.x ?? 0) - (top?.x ?? 0)).toBeGreaterThan(15);
  expect((await wordStarts(page, "nested"))[0]).toBeGreaterThan((await wordStarts(page, "after"))[0] ?? 0);
});

test("Tab nests a numbered item as a, Enter counts on to b, and Shift-Tab brings it back", async ({ page }) => {
  await open(page, "1. first\n2. second");
  await line(page, "second").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");

  await expect(line(page, "second").locator(".md-number")).toHaveText("a.");
  await expect.poll(() => saved(page)).toBe("1. first\n   1. second");

  await page.keyboard.press("Enter");
  await page.keyboard.type("third");
  await expect(line(page, "third").locator(".md-number")).toHaveText("b.");

  await page.keyboard.press("Shift+Tab");
  await expect(line(page, "third").locator(".md-number")).toHaveText("2.");
  await expect.poll(() => saved(page)).toBe("1. first\n   1. second\n2. third");
});

test("starting a bullet under a line of text leaves that line as text, not a heading", async ({ page }) => {
  await open(page, "Words above\n\nThe end.");

  const size = () => line(page, "Words above").evaluate((element) => getComputedStyle(element.querySelector("span") ?? element).fontSize);
  const before = await size();

  await line(page, "Words above").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");

  // `-` alone under text is how Markdown underlines a heading; the notes do not read it so,
  // and the line keeps the size of text rather than taking a heading's.
  expect(await size()).toBe(before);

  await page.keyboard.type("item");
  await expect(line(page, "item").locator(".md-bullet")).toHaveCount(1);
  await expect.poll(() => saved(page)).toContain("Words above\n- item");
});
