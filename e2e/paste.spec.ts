/**
 * Pasting an image into the notes (`claude-spec.md` §2.3): kept in the lecture's `assets/`
 * folder, linked from the notes, and shown in place.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });

test.beforeEach(async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);
});

/** Pastes a file into the editor, as the clipboard would deliver it. */
async function paste(page: Page, bytes: number[], type: string): Promise<void> {
  await notes(page).locator(".cm-content").click();
  await notes(page)
    .locator(".cm-content")
    .evaluate(
      (editor, file) => {
        const transfer = new DataTransfer();

        transfer.items.add(new File([new Uint8Array(file.bytes)], "clip", { type: file.type }));
        editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
      },
      { bytes, type },
    );
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];

test("a pasted screenshot is kept, linked from the notes, and shown", async ({ page }) => {
  await paste(page, PNG, "image/png");

  // Shown in place once the cursor moves on, loaded from the lecture's assets folder.
  await page.keyboard.press("Enter");
  const image = notes(page).locator("img.md-image");

  await expect(image).toHaveCount(1);
  await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth)).toBeGreaterThan(0);

  // Underneath, the Markdown the spec describes.
  await expect.poll(() => saved(page)).toContain("![](assets/20261105-101530-pasted1.png)");
});

test("pasting something that only claims to be an image is refused, with a reason", async ({ page }) => {
  // The format is judged by the bytes, not by the clipboard's label.
  await paste(page, [0x25, 0x50, 0x44, 0x46], "image/png");

  await expect(notes(page).getByText(/not an image Nexus keeps/)).toBeVisible();
  await expect(notes(page).locator(".cm-content")).not.toContainText("![](");
});

test("an image path outside the lecture is not loaded", async ({ page }) => {
  await notes(page).locator(".cm-content").click();
  await page.keyboard.type("![x](../../secret.png)");
  await page.keyboard.press("Enter");

  await expect(notes(page).getByText(/Only images in these notes' assets folder are shown/)).toBeVisible();
  await expect(notes(page).locator("img.md-image")).toHaveCount(0);
});

test("typing on before a pasted image is kept still links it where it was pasted", async ({ page }) => {
  // A fresh window whose disk is slow, so the typing lands first.
  await page.goto("about:blank");
  await openNexus(page, { ...standardFixture(), assetDelayMs: 600, notes: { [READING.directory]: "Before" } });
  await openLecture(page, READING.title);
  await notes(page).locator(".cm-line").filter({ hasText: "Before" }).click();
  await page.keyboard.press("End");

  await paste(page, PNG, "image/png");
  await page.keyboard.type(" and after");

  // The image sits where it was pasted, before the words typed while it was kept.
  const line = notes(page).locator(".cm-line").filter({ has: page.locator("img.md-image") });
  await expect(line).toHaveCount(1);
  expect(
    await line.evaluate((element) => {
      const nodes = [...element.childNodes];
      const image = nodes.findIndex((node) => node instanceof HTMLImageElement && node.classList.contains("md-image"));

      return nodes
        .slice(0, image)
        .map((node) => node.textContent)
        .join("");
    }),
  ).toBe("Before");
  await expect(line).toContainText(" and after");
});
