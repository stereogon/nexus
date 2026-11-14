/**
 * Page tones (2026-11-14, at the user's request, amending §3), as book and PDF readers offer
 * them: Printed, Sepia, Dusk and Night, in every theme. The page's picture is laid on the
 * tone's paper; highlights and stickies are not changed with it, and still show. Chosen from
 * the moon in the document's bar or in Settings, the same choice; Printed until chosen; and
 * the tone this device chose is the one it opens with.
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

type Property = "filter" | "mixBlendMode" | "backgroundColor";
const style = (page: Page, selector: string, property: Property) =>
  page.locator(selector).first().evaluate((element, name) => getComputedStyle(element)[name], property);
const moon = (page: Page) => page.getByRole("button", { name: "Page tone" });
const menu = (page: Page) => page.getByRole("menu", { name: "Page tone" });
const tones = (page: Page) => page.getByRole("dialog", { name: "Settings" }).getByRole("radiogroup", { name: "Page tone" });

async function open(page: Page, scheme: "light" | "dark", fixture: Fixture = standardFixture()): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await openNexus(page, { ...fixture, annotations: { [READING.directory]: [KEY] } });
  await openLecture(page, READING.title);
  await expect(page.locator(".highlight")).toHaveCount(1);
}

/** The page's paper, how its picture is laid on it, and how the highlight is. */
async function drawn(page: Page): Promise<readonly string[]> {
  return [
    await style(page, ".pdf-page", "backgroundColor"),
    await style(page, ".pdf-canvas", "filter"),
    await style(page, ".pdf-canvas", "mixBlendMode"),
    await style(page, ".highlight", "mixBlendMode"),
  ];
}

test("Dusk from the moon: soft grey paper, the page's light dimmed onto it, the highlight tinting it", async ({ page }) => {
  await open(page, "dark");

  // As printed until chosen.
  expect(await drawn(page)).toEqual(["rgb(255, 255, 255)", "none", "normal", "multiply"]);
  await expect(moon(page)).toHaveAttribute("aria-pressed", "false");

  await moon(page).click();
  await expect(menu(page).getByRole("menuitemradio", { name: "Printed" })).toHaveAttribute("aria-checked", "true");
  await expect(menu(page)).toContainText("Photos and scans change with the page.");
  await menu(page).getByRole("menuitemradio", { name: "Dusk" }).click();

  await expect(menu(page)).toHaveCount(0);
  await expect(moon(page)).toHaveAttribute("aria-pressed", "true");
  expect(await drawn(page)).toEqual(["rgb(58, 55, 52)", "invert(1) hue-rotate(180deg) brightness(0.8)", "screen", "screen"]);
  // Drawn over the page, not part of its picture: never inverted with it.
  expect(await style(page, ".highlight-layer", "filter")).toBe("none");

  await moon(page).click();
  await expect(menu(page).getByRole("menuitemradio", { name: "Dusk" })).toHaveAttribute("aria-checked", "true");
  await menu(page).getByRole("menuitemradio", { name: "Printed" }).click();
  expect(await drawn(page)).toEqual(["rgb(255, 255, 255)", "none", "normal", "multiply"]);
});

test("Sepia in a light theme: warm paper, the page multiplied onto it, nothing inverted", async ({ page }) => {
  await open(page, "light");

  await moon(page).click();
  await menu(page).getByRole("menuitemradio", { name: "Sepia" }).click();

  expect(await drawn(page)).toEqual(["rgb(244, 236, 216)", "none", "multiply", "multiply"]);
});

test("Settings holds the same choice as the moon, and Night is darker than Dusk with its text dimmed further", async ({ page }) => {
  await open(page, "dark");
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(tones(page).getByRole("radio")).toHaveCount(4);
  await expect(tones(page).getByRole("radio", { name: "Printed" })).toHaveAttribute("aria-checked", "true");

  await tones(page).getByRole("radio", { name: "Night" }).click();
  await expect(tones(page).getByRole("radio", { name: "Night" })).toHaveAttribute("aria-checked", "true");
  await expect(moon(page)).toHaveAttribute("aria-pressed", "true");
  expect(await drawn(page)).toEqual(["rgb(22, 22, 22)", "invert(1) hue-rotate(180deg) brightness(0.72)", "screen", "screen"]);
});

test("the window opens with the tone this device last chose", async ({ page }) => {
  await open(page, "light", { ...standardFixture(), pageTone: "dusk" });

  await expect(page.locator("html")).toHaveAttribute("data-pages", "dusk");
  expect(await style(page, ".pdf-page", "backgroundColor")).toBe("rgb(58, 55, 52)");
});
