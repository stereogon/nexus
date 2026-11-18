/**
 * The README's screenshots, drawn from the sample fixture into `docs/screenshots/`.
 */
import { expect, test, type Page } from "@playwright/test";

import type { Annotation } from "../../src/ipc/annotations";
import { READING, standardFixture } from "../../e2e/fixture";
import { openLecture, openNexus } from "../../e2e/nexus";

const OUT = "docs/screenshots";

const highlight = (id: string, semantic: "key" | "exam" | "definition", y: number, width: number): Annotation => ({
  kind: "textHighlight",
  id,
  page: 1,
  semantic,
  quote: "Body text on page 1",
  rects: [{ x: 0.08, y, width, height: 0.07 }],
  createdAt: "2026-11-07T09:00:00.000Z",
  updatedAt: "2026-11-07T09:00:00.000Z",
});

const NOTES = [
  "## Leader election",
  "",
  "A node becomes a **candidate** when it hears nothing for a ==randomised timeout==.",
  "",
  '> 📌 **[Page 1](cite://hl-key)**: *"Body text on page 1"*',
  "",
  "- [x] Read the paper's section 5",
  "- [ ] Work through the ==split vote=={exam} example",
  "",
  "```ts",
  "const quorum = Math.floor(nodes / 2) + 1;",
  "```",
  "",
  "Terms only ever increase: $t_{n+1} > t_n$.",
].join("\n");

async function open(page: Page): Promise<void> {
  await openNexus(page, {
    ...standardFixture(),
    notes: { [READING.directory]: NOTES },
    annotations: { [READING.directory]: [highlight("hl-key", "key", 0.25, 0.35), highlight("hl-exam", "exam", 0.1, 0.28)] },
  });
  await openLecture(page, READING.title);
  await expect(page.locator(".md-citation")).toBeVisible();
  await expect(page.locator(".md-math .katex")).toBeVisible();
}

async function theme(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("dialog", { name: "Settings" }).getByRole("radio", { name }).click();
  await page.keyboard.press("Escape");
}

/** Away from every control, so no hover state is in the picture. */
async function rest(page: Page): Promise<void> {
  await page.mouse.move(2, 450);
  await page.waitForTimeout(400);
}

test("workspace, light", async ({ page }) => {
  await open(page);
  await theme(page, /^Paper/u);
  await rest(page);
  await page.screenshot({ path: `${OUT}/workspace-light.png` });
});

test("workspace, dark", async ({ page }) => {
  await open(page);
  await theme(page, /Midnight/u);
  await rest(page);
  await page.screenshot({ path: `${OUT}/workspace-dark.png` });
});

test("themes", async ({ page }) => {
  await open(page);
  await theme(page, /^Funky$/u);
  await page.getByRole("button", { name: "Settings" }).click();
  await rest(page);
  await page.screenshot({ path: `${OUT}/themes.png` });
});

test("search", async ({ page }) => {
  await open(page);
  await theme(page, /Sky/u);
  await page.keyboard.press("Meta+p");
  await page.keyboard.type("process");
  await rest(page);
  await page.screenshot({ path: `${OUT}/search.png` });
});

const WRITING = [
  "## Why a log?",
  "",
  'A follower <span color="green">only appends</span>: a ==committed entry== is never rewritten.',
  "",
  "> [!TIP]",
  '> A leader with a <span color="red_bg">stale term</span> steps down the moment it hears a higher one.',
  "",
  "| Role | Sends | On timeout |",
  "|---|---|---|",
  "| Follower | nothing | becomes a candidate |",
  "| Candidate | votes | starts a new term |",
  "| Leader | heartbeats | — |",
].join("\n");

test("notes", async ({ page }) => {
  await openNexus(page, { ...standardFixture(), notes: { [READING.directory]: WRITING } });
  await openLecture(page, READING.title);
  await expect(page.locator(".md-paint").first()).toBeVisible();
  await theme(page, /Cyberpunk/u);
  await page.getByRole("button", { name: "Notes only" }).click();
  await rest(page);
  await page.screenshot({ path: `${OUT}/notes.png` });
});
