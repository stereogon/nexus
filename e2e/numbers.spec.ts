/**
 * A lecture's number: shown in the sidebar, and edited in the lecture's panel.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING } from "./fixture";
import { openNexus } from "./nexus";

const panel = (page: Page) => page.getByRole("complementary", { name: "Edit lecture" });

async function edit(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: `Edit ${title}` }).click();
  await expect(panel(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openNexus(page);
});

test("an older lecture's number can be taken out of its title in one click", async ({ page }) => {
  await edit(page, READING.title);

  await panel(page).getByRole("button", { name: "Take “2” out of the title" }).click();
  await expect(panel(page).getByLabel("Number")).toHaveValue("2");
  await expect(panel(page).getByLabel("Title")).toHaveValue("ProcessOverview");

  await panel(page).getByRole("button", { name: "Save" }).click();

  const row = page.getByRole("button", { name: "ProcessOverview", exact: true });
  await expect(row).toBeVisible();
  await expect(row.locator(".row-num")).toHaveText("2");
});

test("a number typed in the panel is the one the sidebar shows", async ({ page }) => {
  await edit(page, READING.title);

  await panel(page).getByLabel("Number").fill("4b");
  await panel(page).getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("button", { name: READING.title, exact: true }).locator(".row-num")).toHaveText("4b");
});

test("the offer goes once a number is typed, and is not made for a lecture with one", async ({ page }) => {
  await edit(page, READING.title);
  await panel(page).getByLabel("Number").fill("7");

  await expect(panel(page).getByRole("button", { name: /out of the title/ })).toHaveCount(0);
});
