/**
 * Pasting into the notes (2026-11-09): formatting copied from the web arrives as
 * Markdown, a link pasted over words makes them a link, and code takes text as it is.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });
const line = (page: Page, text: string) => notes(page).locator(".cm-line").filter({ hasText: text });

/** Pastes as the browser does from a copy: plain text, and the HTML when there is any. */
async function paste(page: Page, plain: string, html = ""): Promise<void> {
  await page.evaluate(
    ([text, markup]) => {
      const data = new DataTransfer();

      data.setData("text/plain", text ?? "");

      if (markup !== undefined && markup !== "") {
        data.setData("text/html", markup);
      }

      document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    },
    [plain, html],
  );
}

test.beforeEach(async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: ["Read the paper today.", "", "```", "code", "```", "", "The end."].join("\n") } });
  await openLecture(page, READING.title);
  await line(page, "The end.").click();
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.press("Enter");
});

test("formatting copied from a web page arrives as Markdown", async ({ page }) => {
  await paste(page, "Plan\nmilk\neggs", "<h2>Plan</h2><ul><li><b>milk</b></li><li>eggs</li></ul>");

  await expect.poll(async () => (await saved(page)).split("\n").slice(-4)).toEqual(["## Plan", "", "- **milk**", "- eggs"]);
  await expect(line(page, "Plan")).toHaveClass(/md-h2/);
});

// CodeMirror's Markdown support does this (`pasteURLAsLink`); kept as the user's journey.
test("a link pasted over words makes them that link", async ({ page }) => {
  await line(page, "Read the paper").dblclick({ position: { x: 90, y: 8 } });
  await paste(page, "https://raft.github.io");

  await expect.poll(() => saved(page)).toMatch(/\[\w+\]\(https:\/\/raft\.github\.io\)/u);
});

test("inside code, what was copied is pasted as text", async ({ page }) => {
  await line(page, "code").click();
  await page.keyboard.press("Meta+ArrowRight");
  await paste(page, " plain", "<b> plain</b>");

  await expect.poll(() => saved(page)).toContain("code plain");
  expect(await saved(page)).not.toContain("**");
});
