/**
 * Notes beside the document, and the links between them (`claude-spec.md` §2.3–2.4).
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { bed, dragAcross, openLecture, openNexus, pageField, settleOn, textOn, saved } from "./nexus";

const MENU = { name: "Highlight as" } as const;

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
});

function notes(page: Page) {
  return page.getByRole("complementary", { name: "Notes" });
}

function editor(page: Page) {
  return notes(page).locator(".cm-content");
}

test("the notes sit beside the document, not over it", async ({ page }) => {
  await expect(notes(page)).toBeVisible();

  const pane = await notes(page).boundingBox();
  const document = await bed(page).boundingBox();

  if (pane === null || document === null) {
    throw new Error("The notes or the document is not laid out.");
  }

  expect(document.x + document.width).toBeLessThanOrEqual(pane.x + 1);
});

test("what is typed is saved, and is there when the lecture is opened again", async ({ page }) => {
  await editor(page).click();
  await page.keyboard.type("Raft elects a leader.");
  await expect(notes(page).getByText("Saved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Close document" }).click();
  await openLecture(page, READING.title);

  await expect(editor(page)).toContainText("Raft elects a leader.");
});

test("Link to notes cites a selection at the cursor, as a badge", async ({ page }) => {
  await dragAcross(page, textOn(page, 1).filter({ hasText: "Body text on page 1" }));
  await page.getByRole("group", MENU).getByRole("button", { name: "Link to notes" }).click();

  // Stored as a highlight, and drawn as a citation card once the cursor has moved on.
  await expect(page.locator(".highlight")).toHaveCount(1);
  await expect(notes(page).locator(".md-citation")).toContainText("Page 1");
  await expect(notes(page).locator(".md-citation")).toContainText("“Body text on page 1”");

  // Underneath, the Markdown is exactly the line `lecture_core::citation_block` writes,
  // cited by the id the highlight was stored under.
  await expect.poll(() => saved(page)).toContain('> 📌 **[Page 1](cite://e2e-1)**: *"Body text on page 1"*');
});

test("a citation's badge takes the document to its highlight, and pulses it", async ({ page }) => {
  await pageField(page).fill("7");
  await settleOn(page, 7);
  await dragAcross(page, textOn(page, 7).filter({ hasText: "Body text on page 7" }));
  await page.getByRole("group", MENU).getByRole("button", { name: "Link to notes" }).click();
  await expect(notes(page).locator(".md-citation")).toHaveCount(1);

  await pageField(page).fill("1");
  await settleOn(page, 1);
  await expect(page.getByLabel("Page 7", { exact: true })).not.toBeInViewport();

  await notes(page).getByRole("button", { name: "Page 7" }).click();

  await expect(page.getByLabel("Page 7", { exact: true })).toBeInViewport();
  await expect(page.locator(".highlight.pulse")).toHaveCount(1);
});

test("a citation of a highlight that was removed says so", async ({ page }) => {
  await dragAcross(page, textOn(page, 1).filter({ hasText: "Body text on page 1" }));
  await page.getByRole("group", MENU).getByRole("button", { name: "Link to notes" }).click();
  await page.getByRole("button", { name: /^Key concept:/ }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Remove" }).click();

  await notes(page).getByRole("button", { name: "Page 1" }).click();

  await expect(page.getByText(/no longer has/)).toBeVisible();
});

test("the notes can be hidden and shown, and the document widens", async ({ page }) => {
  const narrow = (await bed(page).boundingBox())?.width ?? 0;

  await notes(page).getByRole("button", { name: "Hide notes" }).click();

  await expect(notes(page)).toBeHidden();
  await expect.poll(async () => (await bed(page).boundingBox())?.width ?? 0).toBeGreaterThan(narrow);

  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(notes(page)).toBeVisible();
});

test("hiding the notes keeps what was typed and where the cursor was", async ({ page }) => {
  await editor(page).click();
  await page.keyboard.type("Before. After.");
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press("ArrowLeft");
  }

  await page.keyboard.press("Meta+Backslash");
  await expect(notes(page)).toBeHidden();
  await page.keyboard.press("Meta+Backslash");
  await expect(notes(page)).toBeVisible();

  await editor(page).focus();
  await page.keyboard.type("Middle. ");

  await expect(editor(page)).toContainText("Before. Middle. After.");
});

test("Link to notes with the notes hidden opens them and cites there", async ({ page }) => {
  const narrow = (await bed(page).boundingBox())?.width ?? 0;

  await notes(page).getByRole("button", { name: "Hide notes" }).click();
  // The document widens and re-fits; select once it has.
  await expect.poll(async () => (await bed(page).boundingBox())?.width ?? 0).toBeGreaterThan(narrow);

  await dragAcross(page, textOn(page, 1).filter({ hasText: "Body text on page 1" }));
  await page.getByRole("group", MENU).getByRole("button", { name: "Link to notes" }).click();

  await expect(notes(page)).toBeVisible();
  await expect(notes(page).locator(".md-citation")).toHaveCount(1);
});
