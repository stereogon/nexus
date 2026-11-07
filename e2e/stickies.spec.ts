/**
 * Sticky notes over the slides (2026-11-05): free-standing text boxes, started beside a
 * highlight, folded to an icon until clicked.
 */
import { expect, test, type Page } from "@playwright/test";

import type { Annotation } from "../src/ipc/annotations";
import { READING, standardFixture } from "./fixture";
import { dragAcross, openLecture, openNexus, textOn } from "./nexus";

const HIGHLIGHT: Annotation = {
  kind: "textHighlight",
  id: "hl-seeded",
  page: 1,
  semantic: "key",
  quote: "Page 1 heading",
  rects: [{ x: 0.05, y: 0.08, width: 0.3, height: 0.08 }],
  createdAt: "2026-11-05T09:00:00.000Z",
  updatedAt: "2026-11-05T09:00:00.000Z",
};

const MENU = { name: "Highlight as" } as const;
const card = (page: Page) => page.getByRole("group", { name: /sticky note/i });
const icons = (page: Page) => page.getByRole("button", { name: /^Sticky note: / });

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), annotations: { [READING.directory]: [HIGHLIGHT] } });
  await openLecture(page, READING.title);
});

/** Starts a note from the highlight's badge menu and writes `text` into it. */
async function writeNote(page: Page, text: string): Promise<void> {
  await page.getByRole("button", { name: /^Key concept:/ }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Sticky note" }).click();
  await page.getByRole("textbox", { name: "Sticky note text" }).fill(text);
  await page.keyboard.press("Enter");
}

test("a note starts beside its highlight, and folds to an icon once written", async ({ page }) => {
  await page.getByRole("button", { name: /^Key concept:/ }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Sticky note" }).click();

  const draft = card(page);
  const fill = await page.locator(".highlight").first().boundingBox();
  const box = await draft.boundingBox();

  if (fill === null || box === null) {
    throw new Error("The highlight or the note is not laid out.");
  }

  // To the right of the highlight, at its height.
  expect(box.x).toBeGreaterThan(fill.x + fill.width);
  expect(Math.abs(box.y - fill.y)).toBeLessThan(6);

  await page.getByRole("textbox", { name: "Sticky note text" }).fill("Ask about the leader lease");
  await page.keyboard.press("Enter");

  await expect(card(page)).toHaveCount(0);
  await expect(icons(page)).toHaveCount(1);
  await expect(icons(page)).toHaveAccessibleName("Sticky note: Ask about the leader lease");
});

test("clicking the icon opens the note, and ✕ folds it again", async ({ page }) => {
  await writeNote(page, "Ask about the leader lease");

  await icons(page).click();
  await expect(card(page)).toContainText("Ask about the leader lease");

  await card(page).getByRole("button", { name: "Fold the sticky note" }).click();
  await expect(card(page)).toHaveCount(0);
});

test("a note abandoned before it has words leaves nothing behind", async ({ page }) => {
  await page.getByRole("button", { name: /^Key concept:/ }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Sticky note" }).click();
  await page.keyboard.press("Escape");

  await expect(card(page)).toHaveCount(0);
  await expect(icons(page)).toHaveCount(0);
});

test("a note can be reworded, and keeps its words across reopening the lecture", async ({ page }) => {
  await writeNote(page, "First thought");
  await icons(page).click();
  await card(page).getByText("First thought").dblclick();
  await page.getByRole("textbox", { name: "Sticky note text" }).fill("Better thought");
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: "Close document" }).click();
  await openLecture(page, READING.title);

  await expect(icons(page)).toHaveAccessibleName("Sticky note: Better thought");
});

test("a note can be dragged somewhere else, and stays there", async ({ page }) => {
  await writeNote(page, "Move me");
  await icons(page).click();

  const grip = card(page).getByRole("button", { name: "Move the sticky note" });
  const before = await card(page).boundingBox();
  const handle = await grip.boundingBox();

  if (before === null || handle === null) {
    throw new Error("The note is not laid out.");
  }

  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 200, handle.y + handle.height / 2 + 150, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => (await card(page).boundingBox())?.y ?? 0).toBeGreaterThan(before.y + 100);

  // Stored, not just drawn: still there after reopening.
  const moved = await card(page).boundingBox();

  await page.getByRole("button", { name: "Close document" }).click();
  await openLecture(page, READING.title);
  await icons(page).click();

  const reopened = await card(page).boundingBox();

  expect(Math.abs((reopened?.y ?? 0) - (moved?.y ?? 0))).toBeLessThan(3);
});

test("a note can be made bigger from its corner", async ({ page }) => {
  await writeNote(page, "Grow me");
  await icons(page).click();

  const before = await card(page).boundingBox();
  const corner = await card(page).getByRole("button", { name: "Resize the sticky note" }).boundingBox();

  if (before === null || corner === null) {
    throw new Error("The note is not laid out.");
  }

  await page.mouse.move(corner.x + 4, corner.y + 4);
  await page.mouse.down();
  await page.mouse.move(corner.x + 84, corner.y + 64, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await card(page).boundingBox())?.width ?? 0).toBeGreaterThan(before.width + 50);
});

test("a note can be cited in the notes", async ({ page }) => {
  await writeNote(page, "Lease = 2 x timeout");
  await icons(page).click();
  await card(page).getByRole("button", { name: "Cite" }).click();

  await expect(page.getByRole("complementary", { name: "Notes" }).locator(".md-citation")).toContainText("Lease = 2 x timeout");
});

test("a note stays when its highlight is removed, being its own thing", async ({ page }) => {
  await writeNote(page, "Still here");

  await page.getByRole("button", { name: /^Key concept:/ }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Remove" }).click();

  await expect(page.locator(".highlight")).toHaveCount(0);
  await expect(icons(page)).toHaveCount(1);
});

test("a note can be deleted", async ({ page }) => {
  await writeNote(page, "Delete me");
  await icons(page).click();
  await card(page).getByRole("button", { name: "Delete" }).click();

  await expect(icons(page)).toHaveCount(0);
});

test("a note can be started from a fresh selection, which is kept as a highlight", async ({ page }) => {
  await dragAcross(page, textOn(page, 1).filter({ hasText: "Body text on page 1" }));
  await page.getByRole("group", MENU).getByRole("button", { name: "Sticky note" }).click();
  await page.getByRole("textbox", { name: "Sticky note text" }).fill("From a selection");
  await page.keyboard.press("Enter");

  await expect(page.locator(".highlight")).toHaveCount(2);
  await expect(icons(page)).toHaveAccessibleName("Sticky note: From a selection");
});

test("a new note can be kept with its Save button, not only with Enter", async ({ page }) => {
  await page.getByRole("button", { name: /^Key concept:/ }).click();
  await page.getByRole("group", MENU).getByRole("button", { name: "Sticky note" }).click();

  const save = card(page).getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();

  await page.getByRole("textbox", { name: "Sticky note text" }).fill("Ask about the leader lease");
  await save.click();

  await expect(card(page)).toHaveCount(0);
  await expect(icons(page)).toHaveAccessibleName("Sticky note: Ask about the leader lease");
});

test("on a small page the card still shows its actions and its words", async ({ page }) => {
  // Reported 2026-11-05: the card is sized as a fraction of the page, and a short slide in a
  // narrow column left it too small for its buttons. The notes made wide narrows the page.
  const divider = await page.getByRole("separator", { name: "Notes width" }).boundingBox();

  if (divider === null) {
    throw new Error("The divider is not laid out.");
  }

  await page.mouse.move(divider.x + 2, divider.y + 300);
  await page.mouse.down();
  await page.mouse.move(0, divider.y + 300, { steps: 5 });
  await page.mouse.up();

  await writeNote(page, "Ask about the leader lease, and why it needs synchronised clocks");
  await icons(page).click();

  for (const name of ["Cite", "Delete", "Fold the sticky note"]) {
    await expect(card(page).getByRole("button", { name })).toBeInViewport({ ratio: 1 });
  }

  const box = await card(page).boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(200);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(112);
});
