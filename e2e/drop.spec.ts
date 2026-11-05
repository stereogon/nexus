/**
 * Dropping an image file onto the notes: kept in the lecture's `assets/` folder and linked
 * where it landed — while a drop anywhere else still means "import".
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
});

/** The middle of an element, in CSS pixels. */
async function middleOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox();

  if (box === null) {
    throw new Error(`${selector} is not laid out.`);
  }

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Sends one phase of a native file drag, at a point in CSS pixels.
 *
 * The first version scaled the point by `devicePixelRatio`, mirroring the window's wrong
 * belief that Tauri reports physical pixels — so the journeys passed while the real app
 * never routed a drop to the notes. The payload now copies what wry 0.57 actually sends.
 * The suite runs as "Desktop Safari", at a device pixel ratio of 2, so reintroducing the
 * division halves every point here too and the journeys fail.
 */
async function drag(
  page: Page,
  phase: "enter" | "over" | "drop" | "leave",
  at: { x: number; y: number },
  paths: readonly string[] = [],
): Promise<void> {
  await page.evaluate(
    async ({ phase, at, paths }) => {
      // As wry reports it on macOS: points, which are CSS pixels, from the top-left.
      await window.__NEXUS_E2E_EMIT__?.(`tauri://drag-${phase}`, { paths, position: at });
    },
    { phase, at, paths },
  );
}

test("an image dropped on the notes is linked there, and shown", async ({ page }) => {
  const over = await middleOf(page, ".notes-pane .cm-content");

  await drag(page, "enter", over, ["/Users/me/Desktop/Screenshot.png"]);
  await drag(page, "over", over);

  // The notes say what a drop will do; the window-wide import overlay stands aside.
  await expect(notes(page)).toHaveClass(/dropping/);
  await expect(page.locator(".drop-overlay")).toHaveCount(0);

  await drag(page, "drop", over, ["/Users/me/Desktop/Screenshot.png"]);

  await expect(notes(page)).not.toHaveClass(/dropping/);
  const image = notes(page).locator("img.md-image");

  await expect(image).toHaveCount(1);
  await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth)).toBeGreaterThan(0);
});

test("over the document, a drag is still an import", async ({ page }) => {
  const document = await middleOf(page, ".viewer-bed");

  await drag(page, "enter", document, ["/Users/me/Downloads/week3.pdf"]);

  await expect(page.locator(".drop-overlay")).toBeVisible();
  await expect(notes(page)).not.toHaveClass(/dropping/);

  // Moving onto the notes hands the drag over to them.
  await drag(page, "over", await middleOf(page, ".notes-pane .cm-content"));

  await expect(page.locator(".drop-overlay")).toHaveCount(0);
  await expect(notes(page)).toHaveClass(/dropping/);

  await drag(page, "leave", document);
  await expect(notes(page)).not.toHaveClass(/dropping/);
});

test("a document dropped on the notes says where to drop it instead", async ({ page }) => {
  const over = await middleOf(page, ".notes-pane .cm-content");

  await drag(page, "enter", over, ["/Users/me/Downloads/week3.pdf"]);
  await drag(page, "drop", over, ["/Users/me/Downloads/week3.pdf"]);

  await expect(notes(page).getByText(/drop it on the page or the sidebar/)).toBeVisible();
  await expect(notes(page).locator(".cm-content")).not.toContainText("![](");
});
