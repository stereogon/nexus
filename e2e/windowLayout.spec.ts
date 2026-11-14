/**
 * The window's layout, Classic or Islands (2026-11-14, the canvas's Layouts row): chosen in
 * Settings, drawn at once, and the one this device chose is the one it opens in.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const layout = (page: Page) => page.getByRole("dialog", { name: "Settings" }).getByRole("radiogroup", { name: "Layout" });
const radius = (page: Page, selector: string) => page.locator(selector).evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
const background = (page: Page, selector: string) => page.locator(selector).evaluate((element) => getComputedStyle(element).backgroundColor);

test("choosing Islands draws each pane as a rounded island on one base, and Classic undoes it", async ({ page }) => {
  await openNexus(page);
  await openLecture(page, READING.title);

  expect(await radius(page, ".viewer")).toBe("0px");

  await page.getByRole("button", { name: "Settings" }).click();
  await layout(page).getByRole("radio", { name: /Islands/u }).click();

  await expect(page.locator("html")).toHaveAttribute("data-layout", "islands");
  await expect(layout(page).getByRole("radio", { name: /Islands/u })).toHaveAttribute("aria-checked", "true");
  for (const pane of [".sidebar", ".viewer", ".notes-pane"]) {
    expect(await radius(page, pane)).toBe("10px");
  }
  // The base shows between the islands, and is not the panes' own colour.
  const base = await background(page, ".app");

  expect(base).not.toBe(await background(page, ".sidebar"));
  expect(await background(page, ".window-bar")).toBe("rgba(0, 0, 0, 0)");
  const sidebar = await page.locator(".sidebar").boundingBox();
  const viewer = await page.locator(".viewer").boundingBox();

  expect((viewer?.x ?? 0) - ((sidebar?.x ?? 0) + (sidebar?.width ?? 0))).toBeGreaterThanOrEqual(6);

  await layout(page).getByRole("radio", { name: /Classic/u }).click();
  await expect(page.locator("html")).toHaveAttribute("data-layout", "classic");
  expect(await radius(page, ".viewer")).toBe("0px");
});

test("the window opens in the layout this device last chose, the hidden sidebar's rail an island too", async ({ page }) => {
  await openNexus(page, { ...standardFixture(), layout: "islands" });
  await openLecture(page, READING.title);

  await expect(page.locator("html")).toHaveAttribute("data-layout", "islands");
  expect(await radius(page, ".viewer")).toBe("10px");

  await page.getByRole("button", { name: "Hide sidebar" }).click();
  expect(await radius(page, ".sidebar-rail")).toBe("10px");
  // Off the window's edge, on the base, as the other islands are.
  expect((await page.locator(".sidebar-rail").boundingBox())?.x ?? 0).toBeGreaterThanOrEqual(6);
});

test("the error panel opens as an island too, apart from the pane beside it", async ({ page }) => {
  await openNexus(page, { ...standardFixture(), layout: "islands" });
  await openLecture(page, READING.title);
  await page.keyboard.press("Meta+0");

  const panel = page.locator(".side-panel");

  await expect(panel).toBeVisible();
  expect(await radius(page, ".side-panel")).toBe("10px");
  // The base shows in the gap between it and the notes.
  const notes = await page.locator(".notes-pane").boundingBox();
  const own = await panel.boundingBox();

  expect((own?.x ?? 0) - ((notes?.x ?? 0) + (notes?.width ?? 0))).toBeGreaterThanOrEqual(6);
});
