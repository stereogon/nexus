/**
 * Pages, notes inside an item's notes (2026-11-14): made from `/page`, opened from their link
 * beside the same document, left by the way up, kept track of in the Pages panel, deleted
 * after asking, and found by ⌘P. Never in the sidebar, which keeps the item marked open
 * whichever of its notes is on screen.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture, type Fixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const trail = (page: Page) => notes(page).getByRole("navigation", { name: "Where this page is" });
const pagesButton = (page: Page) => notes(page).locator("button.notes-pages-button");
const panel = (page: Page) => page.getByRole("dialog", { name: /^Pages in / });
const openRow = (page: Page) => page.locator(".lecture-row[data-open='true']");

function fixture(): Fixture {
  return {
    ...standardFixture(),
    notes: { [READING.directory]: ["Alpha line", "", "[Ideas](page://pg-ideas)", "", "The end."].join("\n") },
    itemPages: {
      [READING.directory]: [
        { id: "pg-ideas", title: "Ideas", parent: null, text: "Leader election thoughts\n" },
        { id: "pg-deeper", title: "Deeper", parent: "pg-ideas", text: "" },
        { id: "pg-loose", title: "Loose ends", parent: null, text: "Quorum sizes to revisit\n" },
      ],
    },
  };
}

test.beforeEach(async ({ page }) => {
  await openNexus(page, fixture());
  await openLecture(page, READING.title);
});

test("/page names a page, leaves its link, and the link opens it beside the document", async ({ page }) => {
  await line(page, "Alpha line").click();
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/page");
  await page.keyboard.press("Enter");

  const form = page.getByRole("dialog", { name: "New page" });

  await form.getByRole("textbox").fill("Raft [draft]");
  await form.getByRole("button", { name: "Make page" }).click();

  await expect(form).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).split("\n")).toContain("[Raft \\[draft\\]](page://pg-e2e1)");

  await notes(page).locator(".md-page-link-open", { hasText: "Raft [draft]" }).click();

  await expect(trail(page).locator("[aria-current='page']")).toHaveText("Raft [draft]");
  // The document stays, and the sidebar still marks the item it belongs to.
  await expect(page.getByLabel("Page 1", { exact: true })).toBeVisible();
  await expect(openRow(page)).toHaveCount(1);
  await expect(openRow(page)).toContainText(READING.title);
  // A page lives inside its note: it never gets a row of its own.
  await expect(page.locator(".lecture-row", { hasText: "Raft [draft]" })).toHaveCount(0);
});

test("a page has a way up to the note it is in, and the trail goes up any number of levels", async ({ page }) => {
  await notes(page).locator(".md-page-link-open", { hasText: "Ideas" }).click();
  await expect(line(page, "Leader election thoughts")).toBeVisible();

  await pagesButton(page).click();
  await panel(page).getByRole("button", { name: "Deeper", exact: true }).click();
  await expect(trail(page)).toContainText(`${READING.title}/Ideas/Deeper`);

  await notes(page).getByRole("button", { name: "In Ideas" }).click();
  await expect(line(page, "Leader election thoughts")).toBeVisible();

  await trail(page).getByRole("button", { name: READING.title }).click();
  await expect(trail(page)).toHaveCount(0);
  await expect(line(page, "Alpha line")).toBeVisible();
});

test("the Pages panel puts back the link of a page whose link was taken out", async ({ page }) => {
  await pagesButton(page).click();

  const ideas = panel(page).getByRole("listitem").filter({ hasText: "Ideas" });
  const loose = panel(page).getByRole("listitem").filter({ hasText: "Loose ends" });

  await expect(ideas).toContainText("In the text");
  await expect(ideas).toContainText("1 page inside");
  await line(page, "The end.").click({ force: true });
  await pagesButton(page).click();
  await loose.getByRole("button", { name: "Link here" }).click();

  await expect.poll(async () => (await saved(page)).split("\n")).toContain("[Loose ends](page://pg-loose)");
});

test("deleting a page asks first, counts the pages inside, and takes its link out", async ({ page }) => {
  await pagesButton(page).click();
  await panel(page).getByRole("button", { name: "Delete Ideas" }).click();

  const asking = page.getByRole("alertdialog", { name: "Delete Ideas" });

  await expect(asking).toContainText("the 1 page inside it");
  await expect(asking.getByRole("button", { name: "Cancel" })).toBeFocused();
  await asking.getByRole("button", { name: "Delete 2 pages" }).click();

  await expect(asking).toHaveCount(0);
  await expect.poll(async () => await saved(page)).not.toContain("page://pg-ideas");
  await expect(pagesButton(page)).toHaveAccessibleName("Pages, 1");
});

test("⌘P finds a page by its text, and opens it beside its document", async ({ page }) => {
  await page.keyboard.press("Meta+p");
  await page.getByRole("dialog", { name: "Search everything" }).getByRole("combobox").fill("quorum sizes");
  await page.getByRole("listbox", { name: "Results" }).getByRole("option").filter({ hasText: "Loose ends" }).click();

  await expect(trail(page).locator("[aria-current='page']")).toHaveText("Loose ends");
  await expect(line(page, "Quorum sizes to revisit")).toBeVisible();
  await expect(openRow(page)).toContainText(READING.title);
});
