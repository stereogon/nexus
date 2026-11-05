/**
 * ⌘Z and ⌘⇧Z for what is marked on the document.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { dragAcross, openLecture, openNexus, textOn } from "./nexus";

const MENU = { name: "Highlight as" } as const;

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
});

async function highlightHeading(page: Page, choice = "Key concept"): Promise<void> {
  await dragAcross(page, textOn(page, 1).filter({ hasText: "Page 1 heading" }));
  await page.getByRole("group", MENU).getByRole("button", { name: choice }).click();
  await expect(page.locator(".highlight")).toHaveCount(1);
}

function notes(page: Page) {
  return page.getByRole("complementary", { name: "Notes" });
}

test("⌘Z takes back a new highlight, and ⌘⇧Z brings it back", async ({ page }) => {
  await highlightHeading(page);

  await page.keyboard.press("Meta+z");
  await expect(page.locator(".highlight")).toHaveCount(0);

  await page.keyboard.press("Meta+Shift+z");
  await expect(page.locator(".highlight")).toHaveCount(1);
  await expect(page.locator(".highlight").first()).toHaveAttribute("data-semantic", "key");
});

test("taking back a re-mark puts the old meaning back", async ({ page }) => {
  await highlightHeading(page);
  await page.getByRole("button", { name: /^Key concept:/ }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Exam / important" }).click();
  await expect(page.locator(".highlight").first()).toHaveAttribute("data-semantic", "exam");

  await page.keyboard.press("Meta+z");

  await expect(page.locator(".highlight").first()).toHaveAttribute("data-semantic", "key");
  await expect(page.locator(".highlight")).toHaveCount(1);
});

test("taking back a Remove brings the same highlight back, so its citations still work", async ({
  page,
}) => {
  await dragAcross(page, textOn(page, 1).filter({ hasText: "Body text on page 1" }));
  await page.getByRole("group", MENU).getByRole("button", { name: "Link to notes" }).click();
  await expect(page.locator(".highlight-notes")).toHaveCount(1);

  await page.getByRole("button", { name: /^Key concept:/ }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".highlight")).toHaveCount(0);

  // Focus off the notes, where ⌘Z would mean the typing.
  await page.locator(".viewer-bed").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Meta+z");

  // The ¶ indicator shows only for a highlight the notes cite by its id: the same id.
  await expect(page.locator(".highlight")).toHaveCount(1);
  await expect(page.locator(".highlight-notes")).toHaveCount(1);
});

test("⌘Z in the notes undoes the typing, never a highlight", async ({ page }) => {
  await highlightHeading(page);

  await notes(page).locator(".cm-content").click();
  await page.keyboard.type("abc");

  // More presses than there is typing: once the notes' own history is empty, the key must
  // still not reach across to the document. (The editor marks ⌘Z handled itself, so this
  // holds even without `typingIn`; the text-box journey below is the one that needs it.)
  for (let press = 0; press < 4; press += 1) {
    await page.keyboard.press("Meta+z");
  }

  await expect(notes(page).locator(".cm-content")).not.toContainText("abc");
  await expect(page.locator(".highlight")).toHaveCount(1);
});

test("⌘Z in a text box undoes the typing there, never a highlight", async ({ page }) => {
  // The notes stop the key themselves; a plain field leaves it unhandled, so this is the
  // case the check for typing exists for.
  await highlightHeading(page);

  await page.getByRole("searchbox", { name: "Search vault" }).fill("raft");
  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Meta+z");

  await expect(page.locator(".highlight")).toHaveCount(1);
});
