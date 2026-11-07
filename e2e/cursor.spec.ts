/**
 * The cursor is drawn where the click put it, on every line (reported 2026-11-07: on the
 * first lines under the title it was not shown at all, though typing went in). The editor
 * draws it (`drawSelection`), so it is an element that can be measured here.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus } from "./nexus";

const LINES = ["Line one", "Line two", "Line three"];

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });

test("clicking the first, second or third line shows the cursor on that line", async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: [...LINES, "Line four"].join("\n") } });
  await openLecture(page, READING.title);

  for (const text of LINES) {
    const line = notes(page).locator(".cm-line").filter({ hasText: text });

    await line.click();

    const cursor = notes(page).locator(".cm-cursor-primary");

    await expect(cursor).toHaveCount(1);

    const lineBox = await line.boundingBox();
    const cursorBox = await cursor.boundingBox();
    const middle = (cursorBox?.y ?? -100) + (cursorBox?.height ?? 0) / 2;

    expect(cursorBox?.height ?? 0, text).toBeGreaterThan(8);
    expect(middle, text).toBeGreaterThan(lineBox?.y ?? 0);
    expect(middle, text).toBeLessThan((lineBox?.y ?? 0) + (lineBox?.height ?? 0));
  }
});
