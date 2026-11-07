/**
 * The notes rendered: prose type, citations as cards, maths, diagrams and charts — each
 * drawn while the cursor is elsewhere and shown as Markdown again when it enters.
 */
import { expect, test, type Page } from "@playwright/test";

import { READING, standardFixture } from "./fixture";
import { openLecture, openNexus, saved } from "./nexus";

const NOTES = [
  "# Week 2",
  "",
  "Raft elects a **leader**, and *followers* replicate its log.",
  "",
  '> 📌 **[Page 4](cite://hl-seeded)**: *"Body text on page 4"*',
  "",
  "Energy: $E = mc^2$, and a broken one: $\\frac{1}{$.",
  "",
  "$$",
  "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
  "$$",
  "",
  "```mermaid",
  "graph LR",
  "  Follower --> Candidate --> Leader",
  "```",
  "",
  "```chart",
  '{"type":"bar","data":{"labels":["Raft","Paxos"],"datasets":[{"label":"Papers","data":[3,5]}]},"options":{"title":"Reading list"}}',
  "```",
  "",
  "```chart",
  '{"type":"bar",',
  "```",
  "",
  "The end.",
].join("\n");

async function openWithNotes(page: Page): Promise<void> {
  const fixture = standardFixture();

  await openNexus(page, {
    ...fixture,
    notes: { [READING.directory]: NOTES },
    annotations: {
      [READING.directory]: [
        {
          kind: "textHighlight",
          id: "hl-seeded",
          page: 4,
          semantic: "key",
          quote: "Body text on page 4",
          rects: [{ x: 0.05, y: 0.28, width: 0.4, height: 0.06 }],
          createdAt: "2026-11-05T09:00:00.000Z",
          updatedAt: "2026-11-05T09:00:00.000Z",
        },
      ],
    },
  });
  await openLecture(page, READING.title);
}

const notes = (page: Page) => page.getByRole("complementary", { name: "Notes" });

test.beforeEach(async ({ page }) => {
  await openWithNotes(page);
});

test("prose is set in Literata, not the editor's monospace", async ({ page }) => {
  // Reported 2026-11-05: CodeMirror's runtime base theme was beating the stylesheet.
  const family = await notes(page)
    .locator(".cm-line")
    .filter({ hasText: "Raft elects" })
    .evaluate((line) => getComputedStyle(line).fontFamily);

  expect(family).toContain("Literata");
});

test("a heading is set larger than the prose under it", async ({ page }) => {
  const size = (text: string) =>
    notes(page)
      .getByText(text, { exact: true })
      .first()
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

  expect(await size("Week 2")).toBeGreaterThan(await size("leader"));
});

test("a citation is a card whose page button takes the document there", async ({ page }) => {
  const card = notes(page).locator(".md-citation");

  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Page 4");
  await expect(card).toContainText("“Body text on page 4”");

  await card.getByRole("button", { name: "Page 4" }).click();

  await expect(page.getByLabel("Page 4", { exact: true })).toBeInViewport();
  await expect(page.locator(".highlight.pulse")).toHaveCount(1);
});

test("a citation is an element: clicking it opens nothing, and ✕ removes it whole", async ({ page }) => {
  // Until 2026-11-07 a click opened its Markdown; it is kept or deleted, never edited.
  await notes(page).locator(".md-citation-quote").click();
  await expect(notes(page).locator(".md-citation")).toHaveCount(1);

  await notes(page).locator(".md-citation").hover();
  await notes(page).getByRole("button", { name: "Remove citation" }).click();

  await expect(notes(page).locator(".md-citation")).toHaveCount(0);
  await expect.poll(() => saved(page)).not.toContain("cite://hl-seeded");
});

test("maths is typeset, inline and as a block", async ({ page }) => {
  await expect(notes(page).locator(".md-math:not(.md-math-display) .katex")).toHaveCount(1);
  await expect(notes(page).locator(".md-math-display .katex-display")).toHaveCount(1);
});

test("a broken formula says so, and the editor keeps working", async ({ page }) => {
  // §1.4: an invalid formula shows a hint and keeps the editor mounted.
  await expect(notes(page).getByText(/This formula could not be typeset/)).toBeVisible();

  await notes(page).locator(".cm-line").filter({ hasText: "The end." }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Still typing.");

  await expect(notes(page).locator(".cm-content")).toContainText("The end. Still typing.");
});

test("a mermaid block is drawn as a diagram", async ({ page }) => {
  await expect(notes(page).locator(".md-diagram svg")).toHaveCount(1, { timeout: 15_000 });
  await expect(notes(page).locator(".md-diagram")).toContainText("Leader");
});

test("a chart block is drawn, and a broken one explains itself", async ({ page }) => {
  await expect(notes(page).locator(".md-chart canvas")).toHaveCount(1, { timeout: 15_000 });
  await expect(notes(page).getByText(/This chart is not valid JSON/)).toBeVisible();
});

test("moving the cursor into a formula shows its source", async ({ page }) => {
  await notes(page).locator(".md-math").first().click();

  await expect(notes(page).locator(".cm-content")).toContainText("$E = mc^2$");
});
