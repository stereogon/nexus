/**
 * Folders: stepping through them, making notes and folders in them, and moving an item
 * from one to another. The sidebar shows one folder at a time (2026-11-06).
 */
import { expect, test, type Page } from "@playwright/test";

import { OTHER, READING } from "./fixture";
import { openLecture, openNexus, showFolderOf } from "./nexus";

const sidebar = (page: Page) => page.locator(".sidebar");
const crumbs = (page: Page) => page.getByRole("navigation", { name: "Folder" });

test.beforeEach(async ({ page }) => {
  await openNexus(page);
});

test("the top of the vault shows its folders, and stepping in shows what is inside", async ({ page }) => {
  await expect(sidebar(page).getByRole("button", { name: "Folder week-1", exact: true })).toBeVisible();
  await expect(sidebar(page).getByRole("button", { name: READING.title, exact: true })).toHaveCount(0);

  await sidebar(page).getByRole("button", { name: "Folder week-2", exact: true }).click();

  await expect(sidebar(page).getByRole("button", { name: READING.title, exact: true })).toBeVisible();
  await expect(crumbs(page).getByRole("button", { name: "week-2" })).toHaveAttribute("aria-current", "location");

  await page.getByRole("button", { name: "Back to the folder above" }).click();

  await expect(sidebar(page).getByRole("button", { name: "Folder week-2", exact: true })).toBeVisible();
});

test("a folder made here is stepped into, and a note made there opens to be written in", async ({ page }) => {
  await page.getByRole("button", { name: "New note, folder or import" }).click();
  await page.getByRole("menuitem", { name: "Folder" }).click();
  await page.getByLabel("Name of the new folder").fill("Journal");
  await page.getByLabel("Name of the new folder").press("Enter");

  await expect(crumbs(page).getByRole("button", { name: "Journal" })).toHaveAttribute("aria-current", "location");
  await expect(sidebar(page).getByText(/Nothing here yet/)).toBeVisible();

  await page.getByRole("button", { name: "New note, folder or import" }).click();
  await page.getByRole("menuitem", { name: "Note" }).click();
  await page.getByLabel("Name of the new note").fill("Monday plans");
  await page.getByLabel("Name of the new note").press("Enter");

  // A note has no document: its notes are the whole pane, headed by its name.
  const notes = page.getByRole("complementary", { name: "Notes" });
  await expect(notes.locator(".notes-title")).toHaveText("Journal /Monday plans");
  // As the canvas draws a note: its formatting open from the start, under the header.
  await expect(notes.getByRole("toolbar", { name: "Format" })).toBeVisible();
  await expect(notes.getByRole("button", { name: "Formatting" })).toHaveAttribute("aria-pressed", "true");
  // Under the header, not below the writing; and the writing centred, with margins.
  const strip = await notes.getByRole("toolbar", { name: "Format" }).boundingBox();
  const writing = await notes.locator(".cm-content").boundingBox();
  const pane = await notes.boundingBox();

  if (strip === null || writing === null || pane === null) {
    throw new Error("The note is not laid out.");
  }

  expect(strip.y).toBeLessThan(writing.y);
  expect(Math.abs(writing.x - pane.x - (pane.x + pane.width - (writing.x + writing.width)))).toBeLessThan(24);
  await expect(page.getByLabel("Page 1", { exact: true })).toHaveCount(0);
  await expect(sidebar(page).getByRole("button", { name: "Monday plans", exact: true })).toBeVisible();
  await expect(notes.locator(".notes-bar")).toContainText("Journal /");

  await notes.locator(".cm-content").click();
  await page.keyboard.type("Call the library");
  await expect(notes.locator(".notes-status")).toHaveText("Saved");

  await notes.getByRole("button", { name: "Close" }).click();
  await expect(notes).toHaveCount(0);
});

test("a blank name makes nothing", async ({ page }) => {
  await page.getByRole("button", { name: "New note, folder or import" }).click();
  await page.getByRole("menuitem", { name: "Note" }).click();
  await page.getByLabel("Name of the new note").press("Enter");

  await expect(page.getByLabel("Name of the new note")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Notes" })).toHaveCount(0);
});

test("moving the open document takes it, and the sidebar, to its new folder", async ({ page }) => {
  await openLecture(page, READING.title);
  await page.getByRole("button", { name: `Edit ${READING.title}` }).click();

  const panel = page.getByRole("complementary", { name: "Edit document" });
  // Filed by where it is now, so none of the old fields are asked for.
  await expect(panel.getByLabel("Course")).toHaveCount(0);
  await panel.getByLabel("Folder").selectOption("week-1");
  await panel.getByRole("button", { name: "Save" }).click();

  // Confirmed with the document still open: the message floats over whatever is open.
  await expect(page.getByRole("status").filter({ hasText: `Moved "${READING.title}" to week-1.` })).toBeVisible();
  await expect(crumbs(page).getByRole("button", { name: "week-1" })).toHaveAttribute("aria-current", "location");
  await expect(sidebar(page).getByRole("button", { name: READING.title, exact: true })).toBeVisible();
  await expect(sidebar(page).getByRole("button", { name: OTHER.title, exact: true })).toBeVisible();
  // Opened again from where it now is, so the page is still drawn.
  await expect(page.getByLabel("Page 1", { exact: true })).toBeVisible();
});

test("searching looks through every folder and says where each result is", async ({ page }) => {
  await showFolderOf(page, OTHER.title);
  await page.getByRole("button", { name: /Search everything/u }).click();
  await page.keyboard.type("Process");

  const found = page.getByRole("listbox", { name: "Results" }).getByRole("option").filter({ hasText: READING.title });

  await expect(found).toContainText("week-2");
  await found.click();

  // Opening it shows its folder in the sidebar, whichever one was showing.
  await expect(crumbs(page).getByRole("button", { name: "week-2" })).toHaveAttribute("aria-current", "location");
});

test("deleting the open document closes it, asks first, and takes it out of the list", async ({ page }) => {
  await openLecture(page, READING.title);
  await page.getByRole("button", { name: `Edit ${READING.title}` }).click();

  const panel = page.getByRole("complementary", { name: "Edit document" });
  await panel.getByRole("button", { name: "Delete this document…" }).click();
  // Nothing has moved yet: it is still open, and still listed.
  await expect(page.getByLabel("Page 1", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText(/It is in the vault's hidden .trash folder/)).toBeVisible();
  await expect(page.getByLabel("Page 1", { exact: true })).toHaveCount(0);
  await expect(sidebar(page).getByRole("button", { name: READING.title, exact: true })).toHaveCount(0);
});
