/**
 * Dark pages (2026-11-14, at the user's request, amending §3): in a dark theme, when chosen,
 * a document's pages are inverted to sit with it; highlights and stickies are not, and still
 * show. Chosen in Settings or from the moon in the document's bar, which is not there in a
 * light theme; off until chosen; and the choice this device made is the one it opens with.
 */
import { expect, test, type Page } from "@playwright/test";

import type { Annotation } from "../src/ipc/annotations";
import { READING, standardFixture, type Fixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const KEY: Annotation = {
  kind: "textHighlight",
  id: "hl-key",
  page: 1,
  semantic: "key",
  quote: "A key point",
  rects: [{ x: 0.05, y: 0.3, width: 0.4, height: 0.06 }],
  createdAt: "2026-11-14T09:00:00.000Z",
  updatedAt: "2026-11-14T09:00:00.000Z",
};

const style = (page: Page, selector: string, property: "filter" | "mixBlendMode" | "backgroundColor") =>
  page.locator(selector).first().evaluate((element, name) => getComputedStyle(element)[name], property);
const moon = (page: Page) => page.getByRole("button", { name: "Dark pages" });
const settingsSwitch = (page: Page) => page.getByRole("dialog", { name: "Settings" }).getByRole("switch", { name: /Dark pages/u });

/** Opens the reading in a dark window (Follow macOS, macOS dark: Ink). */
async function openDark(page: Page, fixture: Fixture = standardFixture()): Promise<void> {
  await page.emulateMedia({ colorScheme: "dark" });
  await openNexus(page, { ...fixture, annotations: { [READING.directory]: [KEY] } });
  await openLecture(page, READING.title);
  await expect(page.locator(".highlight")).toHaveCount(1);
}

test("the moon turns a dark theme's pages dark, leaving the highlights drawn over them, and back", async ({ page }) => {
  await openDark(page);

  // Off until chosen: the page as printed.
  await expect(moon(page)).toHaveAttribute("aria-pressed", "false");
  expect(await style(page, ".pdf-canvas", "filter")).toBe("none");
  expect(await style(page, ".pdf-page", "backgroundColor")).toBe("rgb(255, 255, 255)");

  await moon(page).click();

  await expect(moon(page)).toHaveAttribute("aria-pressed", "true");
  expect(await style(page, ".pdf-canvas", "filter")).toContain("invert(0.92)");
  expect(await style(page, ".pdf-canvas", "filter")).toContain("hue-rotate(180deg)");
  expect(await style(page, ".pdf-page", "backgroundColor")).toBe("rgb(20, 20, 20)");
  // The highlight is not inverted with the page, and tints it rather than vanishing.
  expect(await style(page, ".highlight-layer", "filter")).toBe("none");
  expect(await style(page, ".highlight", "mixBlendMode")).toBe("screen");

  await moon(page).click();
  expect(await style(page, ".pdf-canvas", "filter")).toBe("none");
  expect(await style(page, ".highlight", "mixBlendMode")).toBe("multiply");
});

test("Settings holds the same choice as the moon, and says what it costs", async ({ page }) => {
  await openDark(page);
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(settingsSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect(settingsSwitch(page)).toContainText("Photos, diagrams and scans invert too");

  await settingsSwitch(page).click();
  await expect(settingsSwitch(page)).toHaveAttribute("aria-checked", "true");
  await expect(moon(page)).toHaveAttribute("aria-pressed", "true");
  expect(await style(page, ".pdf-canvas", "filter")).toContain("invert");
});

test("a light theme keeps its pages as printed, and shows no moon, whatever was chosen", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openNexus(page, { ...standardFixture(), pageTone: "dark" });
  await openLecture(page, READING.title);

  await expect(page.locator("html")).toHaveAttribute("data-pages", "dark");
  await expect(moon(page)).toBeHidden();
  expect(await style(page, ".pdf-canvas", "filter")).toBe("none");
  expect(await style(page, ".pdf-page", "backgroundColor")).toBe("rgb(255, 255, 255)");
});

test("the window opens with the pages this device last chose", async ({ page }) => {
  await openDark(page, { ...standardFixture(), pageTone: "dark" });

  await expect(moon(page)).toHaveAttribute("aria-pressed", "true");
  expect(await style(page, ".pdf-canvas", "filter")).toContain("invert");
});
