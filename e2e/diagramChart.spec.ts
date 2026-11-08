/**
 * Diagram and Chart blocks from `+`'s menu (2026-11-08): a diagram from pasted Mermaid code,
 * drawn below it as it is typed; a chart made in a form rather than written as JSON.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const CHART = ["```chart", '{"type":"bar","data":{"labels":["Mon","Tue"],"datasets":[{"label":"Hours","data":[2,3]}]}}', "```"];
const NOTES = ["Alpha line", "", "Beta line", "", ...CHART, "", "The end."].join("\n");

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });
const form = (page: Page) => page.getByRole("dialog", { name: /chart/u });

async function plus(page: Page, item: "Diagram" | "Chart"): Promise<void> {
  await line(page, "Beta line").hover();
  await notes(page).getByRole("button", { name: "Add a line below" }).click();
  await page.getByRole("menu", { name: "Turn into" }).getByRole("menuitem", { name: item }).click();
}

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: NOTES } });
  await openLecture(page, READING.title);
  await expect(line(page, "Alpha line")).toBeVisible();
});

test("Diagram opens a block to paste Mermaid into, drawn below it as it is typed", async ({ page }) => {
  await plus(page, "Diagram");
  // Empty, it says what to do rather than failing.
  await expect(notes(page).locator(".md-diagram-empty")).toContainText("Paste Mermaid code");

  await page.keyboard.type("graph TD; Idea --> Notes");

  await expect.poll(() => saved(page)).toContain("```mermaid\ngraph TD; Idea --> Notes\n```");
  // Still inside the block, the diagram is already drawn.
  await expect(notes(page).locator(".md-diagram svg")).toHaveCount(1, { timeout: 15_000 });
});

test("Chart opens a form; a grid pasted from a spreadsheet becomes the chart", async ({ page }) => {
  await plus(page, "Chart");
  await expect(form(page)).toBeVisible();

  await form(page).getByRole("textbox", { name: "Label 1" }).focus();
  await page.evaluate(() => {
    const data = new DataTransfer();

    data.setData("text/plain", "\tWeek 1\tWeek 2\nPages read\t12\t30");
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
  });
  await expect(form(page).getByRole("textbox", { name: "Label 2" })).toHaveValue("Week 2");
  await form(page).getByRole("button", { name: "Line" }).click();
  await form(page).getByRole("textbox", { name: "Title" }).fill("Reading");
  await form(page).getByRole("button", { name: "Insert chart" }).click();

  await expect(form(page)).toHaveCount(0);
  await expect.poll(() => saved(page)).toContain('"type": "line"');
  await expect.poll(() => saved(page)).toContain('"Pages read"');
  await expect(notes(page).locator(".md-chart canvas")).toHaveCount(2);
});

test("a value that is not a number is said, and nothing is written", async ({ page }) => {
  await plus(page, "Chart");
  await form(page).getByRole("textbox", { name: "Series 1 at Tue" }).fill("lots");
  await form(page).getByRole("button", { name: "Insert chart" }).click();

  await expect(form(page).getByRole("alert")).toHaveText("“Series 1” at “Tue” needs a number.");
  await page.keyboard.press("Escape");
  await expect.poll(() => saved(page)).not.toContain("lots");
});

test("Edit chart reopens a drawn chart in the form, and saving rewrites its block", async ({ page }) => {
  await notes(page).getByRole("button", { name: "Edit chart" }).click();

  await expect(form(page).getByRole("textbox", { name: "Hours at Tue" })).toHaveValue("3");
  await form(page).getByRole("textbox", { name: "Hours at Tue" }).fill("5");
  await form(page).getByRole("button", { name: "Save chart" }).click();

  await expect.poll(() => saved(page)).toContain('"data": [\n          2,\n          5\n        ]');
  await expect.poll(() => saved(page)).not.toContain('"data":[2,3]');
});
