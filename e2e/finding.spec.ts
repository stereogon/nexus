/**
 * Finding things in the vault: ⌘P search inside notes and highlights, and the highlights
 * library — each leading to the place itself.
 */
import { expect, test, type Page } from "@playwright/test";

import type { Annotation } from "../src/ipc/annotations";
import { OTHER, READING, standardFixture, type Fixture } from "./fixture";
import { openNexus } from "./nexus";

function mark(id: string, page: number, semantic: "key" | "exam", quote: string): Annotation {
  return {
    kind: "textHighlight",
    id,
    page,
    semantic,
    quote,
    rects: [{ x: 0.1, y: 0.4, width: 0.4, height: 0.05 }],
    createdAt: "2026-11-05T09:00:00Z",
    updatedAt: "2026-11-05T09:00:00Z",
  };
}

/** Long notes, so the matching line is out of view until the notes are taken to it. */
const NOTES = [...Array.from({ length: 50 }, (_, at) => `Line ${String(at + 1)} of filler.`), "A quorum is a majority of the cluster.", "The end."].join("\n");

function fixture(): Fixture {
  return {
    ...standardFixture(),
    notes: { [READING.directory]: NOTES },
    annotations: {
      [READING.directory]: [mark("hl-quorum", 3, "exam", "Every quorum overlaps"), mark("hl-term", 2, "key", "Terms only grow")],
      [OTHER.directory]: [mark("hl-leader", 1, "exam", "Leader election by vote")],
    },
  };
}

/** Opens the ⌘P window and answers its field. */
async function search(page: Page) {
  await page.keyboard.press("Meta+p");

  return page.getByRole("dialog", { name: "Search everything" }).getByRole("combobox");
}

const results = (page: Page) => page.getByRole("listbox", { name: "Results" });
const result = (page: Page, text: string) => results(page).getByRole("option").filter({ hasText: text });
const library = (page: Page) => page.getByRole("main", { name: "Highlights" });

test.beforeEach(async ({ page }) => {
  await openNexus(page, fixture());
  await expect(page.getByRole("button", { name: /Search everything/u })).toBeVisible();
});

test("a search finds words in lectures' notes and highlights", async ({ page }) => {
  await (await search(page)).fill("QUORUM");

  await expect(result(page, "line 51")).toContainText("A quorum is a majority");
  await expect(result(page, "page 3")).toContainText("Every quorum overlaps");
  await expect(result(page, "page 3").locator(".search-glyph")).toHaveText("E");
  await expect(results(page).locator("mark").first()).toHaveText("quorum");
});

test("one letter is not searched", async ({ page }) => {
  await (await search(page)).fill("q");

  // Names still match as typed; notes and highlights wait for a second letter.
  await expect(result(page, "line ")).toHaveCount(0);
  await expect(result(page, "page ")).toHaveCount(0);
});

/** Records whether "no longer has that highlight" is ever shown, even for a moment. */
async function watchForMissing(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => {
    new MutationObserver(() => {
      if (document.body.textContent.includes("no longer has")) {
        document.documentElement.dataset.sawMissing = "yes";
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });

  return () => page.evaluate(() => document.documentElement.dataset.sawMissing === "yes");
}

test("a highlight found by search opens its lecture there, and pulses", async ({ page }) => {
  const sawMissing = await watchForMissing(page);

  await (await search(page)).fill("quorum");
  await result(page, "page 3").click();

  await expect(page.locator(".highlight.pulse")).toHaveCount(1);
  await expect(page.locator(".highlight.pulse")).toBeInViewport();
  // Waited for the lecture rather than saying, even briefly, that the highlight is gone.
  expect(await sawMissing()).toBe(false);
});

test("a line of notes found by search opens its lecture with the notes at that line", async ({ page }) => {
  await (await search(page)).fill("quorum");
  await result(page, "line 51").click();

  const line = page.getByRole("complementary", { name: "Notes" }).locator(".cm-line", { hasText: "A quorum is a majority" });

  await expect(line).toBeInViewport();
});

test("the library lists every highlight, and filters by meaning and by folder", async ({ page }) => {
  await page.getByRole("button", { name: "Highlights library" }).click();

  await expect(library(page).locator(".library-mark")).toHaveCount(3);
  await expect(library(page)).toContainText("3 highlights");

  await library(page).getByRole("button", { name: "Exam", exact: true }).click();
  await expect(library(page).locator(".library-mark")).toHaveCount(2);

  await library(page).getByLabel("Folder").selectOption("week-2");
  await expect(library(page).locator(".library-mark")).toHaveCount(1);
  await expect(library(page).locator(".library-mark")).toContainText("Every quorum overlaps");
});

test("a highlight chosen in the library opens its lecture there, and the library closes", async ({ page }) => {
  await page.getByRole("button", { name: "Highlights library" }).click();
  await library(page).getByRole("button", { name: /Leader election by vote/ }).click();

  await expect(library(page)).toHaveCount(0);
  await expect(page.locator(".highlight.pulse")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Close document" })).toBeVisible();
});
