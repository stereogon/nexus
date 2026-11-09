/**
 * ⌘⇧V pastes the clipboard as plain text (2026-11-09): the words, where the cursor is,
 * replacing what is selected, with nothing made of the formatting.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });

async function open(page: Page, clipboard?: string) {
  await openNexus(page, {
    ...standardFixture(),
    notes: { [READING.directory]: "Raft elects a leader." },
    ...(clipboard === undefined ? {} : { clipboard }),
  });
  await openLecture(page, READING.title);
  await line(page, "Raft elects").click();
  await page.keyboard.press("Meta+ArrowRight");
}

test("⌘⇧V puts the clipboard's words at the cursor, as they are", async ({ page }) => {
  await open(page, " By **majority** vote.\nThen logs.");

  await page.keyboard.press("Meta+Shift+V");

  // Written exactly as copied: nothing added, nothing taken out.
  await expect.poll(() => saved(page)).toBe("Raft elects a leader. By **majority** vote.\nThen logs.");
});

test("⌘⇧V replaces what is selected", async ({ page }) => {
  await open(page, "a candidate");
  await page.keyboard.press("Meta+ArrowLeft");
  await page.keyboard.press("Alt+Shift+ArrowRight");

  await page.keyboard.press("Meta+Shift+V");

  await expect.poll(() => saved(page)).toBe("a candidate elects a leader.");
});

test("with no text on the clipboard, ⌘⇧V changes nothing", async ({ page }) => {
  await open(page);

  await page.keyboard.press("Meta+Shift+V");
  await page.keyboard.type("!");

  await expect.poll(() => saved(page)).toBe("Raft elects a leader.!");
});
