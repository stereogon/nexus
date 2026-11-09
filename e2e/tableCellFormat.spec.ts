/**
 * A table cell keeps its formatting while it is edited (2026-11-09), as the rest of the
 * notes do: no `**` appears when the cell is clicked or its words selected, typing inside
 * bold words keeps them bold, and the notes still hold the Markdown. And formatted from the
 * floating bar, the strip under the header and the keys, as the rest of the notes are.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const TABLE = ["| Topic | Finding |", "| --- | --- |", "| Novelty | fed **ambiguity** and *doubt* |"];
const NOTES = ["Alpha line", "", ...TABLE, "", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const finding = (page: Page) => notes(page).getByRole("textbox", { name: "Row 1, column 2", exact: true });
const row = async (page: Page) => (await saved(page)).split("\n").find((text) => text.startsWith("| Novelty")) ?? "";

/** Selects `words` in the finding cell, as a drag over them would. */
async function select(page: Page, words: string): Promise<void> {
  await finding(page).click();
  await finding(page).evaluate((cell, wanted) => {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(wanted) ?? -1;

      if (at !== -1) {
        const range = document.createRange();

        range.setStart(node, at);
        range.setEnd(node, at + wanted.length);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
        return;
      }
    }

    throw new Error(`"${wanted}" is not in the cell`);
  }, words);
}

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(finding(page)).toBeVisible();
});

test("clicking and selecting in a cell shows its words formatted, never the marks", async ({ page }) => {
  await finding(page).click();
  await page.keyboard.press("Meta+a");

  await expect(finding(page)).toBeFocused();
  await expect(finding(page)).toHaveText("fed ambiguity and doubt");
  await expect(finding(page).locator("strong")).toHaveText("ambiguity");
  await expect(finding(page).locator("em")).toHaveText("doubt");
});

test("typing inside bold words keeps them bold, in the cell and in the notes", async ({ page }) => {
  const bold = finding(page).locator("strong");
  const box = await bold.boundingBox();

  // Between "ambig" and "uity", near the middle of the bold word.
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await page.keyboard.type("X");

  await expect(bold).toContainText("X");
  await expect.poll(async () => (await saved(page)).includes("| Novelty | fed **ambiXguity** and _doubt_ |")).toBe(true);
  // Still formatted after the notes were rewritten.
  await expect(finding(page)).not.toContainText("**");
});

test("pasting into a cell adds the words as plain text, on one line", async ({ page }) => {
  await finding(page).click();
  await page.keyboard.press("Meta+ArrowRight");
  await finding(page).evaluate((cell) => {
    const data = new DataTransfer();

    data.setData("text/plain", " one\ntwo");
    cell.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });

  const row = async () => (await saved(page)).split("\n").filter((text) => text.startsWith("| Novelty"));

  await expect.poll(async () => (await row()).join("\n")).toContain("one two");
  expect(await row()).toHaveLength(1);
  expect((await saved(page)).split("\n").filter((text) => text.startsWith("|"))).toHaveLength(3);
});

test("selecting words in a cell raises the format bar, and Bold then Italic format them", async ({ page }) => {
  const bar = page.getByRole("toolbar", { name: "Format" });

  await select(page, "fed");
  await expect(bar).toBeVisible();
  // Only inline formats: a cell holds no heading, list or highlight.
  await expect(bar.getByRole("button", { name: "Heading 1" })).toBeDisabled();

  await bar.getByRole("button", { name: "Bold" }).click();
  await expect.poll(() => row(page)).toContain("| **fed** **ambiguity**");
  await expect(bar.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");

  // Pressed again, it comes off; the words stay selected throughout.
  await bar.getByRole("button", { name: "Bold" }).click();
  await expect.poll(() => row(page)).toContain("| fed **ambiguity**");

  // So a second format follows the first without selecting again.
  await bar.getByRole("button", { name: "Bold" }).click();
  await bar.getByRole("button", { name: "Italic" }).click();
  await expect.poll(() => row(page)).toContain("| **_fed_** **ambiguity**");
  await expect(finding(page)).toHaveText("fed ambiguity and doubt");
  await expect(finding(page).locator("strong em")).toHaveText("fed");
  await expect(finding(page)).toBeFocused();
});

test("⌘B and ⌘E format a cell's selected words, as in the rest of the notes", async ({ page }) => {
  await select(page, "and");
  await page.keyboard.press("Meta+b");
  await expect.poll(() => row(page)).toContain("**ambiguity** **and** _doubt_");

  await page.keyboard.press("Meta+e");
  await expect.poll(() => row(page)).toContain("**`and`**");
});

test("the strip under the notes' header formats a cell's selected words", async ({ page }) => {
  await notes(page).getByRole("button", { name: "Formatting" }).click();
  const strip = notes(page).locator(".format-strip");

  await select(page, "fed");
  await strip.getByRole("button", { name: "Strikethrough" }).click();

  await expect.poll(() => row(page)).toContain("| ~~fed~~ **ambiguity**");
  await expect(strip.getByRole("button", { name: "Strikethrough" })).toHaveAttribute("aria-pressed", "true");
});
