/**
 * Opening Nexus in a Playwright page, and the few moves every journey makes.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import { standardFixture, type Fixture } from "./fixture";
import { pdfOf } from "./pdf";

export async function openNexus(page: Page, fixture: Fixture = standardFixture()): Promise<void> {
  await page.addInitScript((data) => {
    window.__NEXUS_E2E__ = data;
  }, fixture);

  // Answers the URLs `convertFileSrc` produces in the harness. The path is the lecture's
  // directory, because that is what the fake `open_document` hands back.
  await page.route("http://asset.localhost/**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));

    // An image from a lecture's assets folder: answered with a small picture, so the
    // journey can see one load. The app's rule is about which *paths* it asks for, which
    // this does not need to mimic.
    if (/\/assets\/[^/]+\.png$/.test(path)) {
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#2E86DE"/></svg>',
      });
      return;
    }

    const directory = path;
    const pages = fixture.pages[directory];

    if (pages === undefined) {
      await route.fulfill({ status: 404 });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      // Cross-origin from the dev server, and pdf.js fetches it, so it needs saying.
      headers: { "Access-Control-Allow-Origin": "*" },
      body: pdfOf(pages),
    });
  });

  await page.goto("/e2e/harness.html");
}

/** Opens a lecture from the sidebar and waits for its first page to draw. */
export async function openLecture(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByLabel("Page 1", { exact: true })).toBeVisible();
  await expect(textOn(page, 1).first()).toBeVisible();
}

/** The document's scroll container. */
export function bed(page: Page): Locator {
  return page.locator(".viewer-bed");
}

/** The pdf.js text spans on a page, counting from 1 as the screen does. */
export function textOn(page: Page, number: number): Locator {
  return page.getByLabel(`Page ${String(number)}`, { exact: true }).locator(".textLayer span");
}

/**
 * Waits until a page sits at the top of the document, which is what going to it promises.
 *
 * A condition, not a pause. Moving one page glides for about 300 ms, and anything done
 * mid-glide happens to a document still moving under the mouse — a selection made then
 * has its menu closed by the scroll events still arriving, which is the behaviour the
 * menu is meant to have. Measured on 2026-11-05 when the right-margin journey failed for
 * exactly that reason: `scrollTop` read 1, 428, 555, 560, 560 across half a second.
 */
export async function settleOn(page: Page, number: number): Promise<void> {
  const sheet = page.getByLabel(`Page ${String(number)}`, { exact: true });

  await expect
    .poll(async () => {
      const top = (await sheet.boundingBox())?.y;
      const bedTop = (await bed(page).boundingBox())?.y;

      return top === undefined || bedTop === undefined ? Number.POSITIVE_INFINITY : top - bedTop;
    })
    // The bed's own top padding sits between its edge and the first pixel of a page.
    .toBeLessThan(32);
  // Then still: unchanged across two animation frames, so the last pixels of a glide are
  // not mistaken for its end.
  await expect
    .poll(() =>
      bed(page).evaluate(async (element) => {
        const before = element.scrollTop;

        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });

        return element.scrollTop - before;
      }),
    )
    .toBe(0);
}

/** The page number field. */
export function pageField(page: Page): Locator {
  return page.getByLabel("Page number");
}

/**
 * Selects a run of text with the mouse, the way a person does.
 *
 * A real drag rather than a `Range` built in script: the bugs this suite exists for came
 * from what the *browser* reports for a mouse selection — the text layer's trailing
 * sliver among them — and a script-built range would skip exactly that.
 */
export async function dragAcross(page: Page, span: Locator, overshoot = 0): Promise<void> {
  // The text layer is rebuilt whenever the page re-fits -- the notes opening or closing
  // beside it, say -- and for that moment the span does not exist. Wait for the
  // condition the drag needs rather than reaching for a span mid-rebuild (found on
  // 2026-11-05 when a journey that hides the notes first failed one run in five).
  await expect(span).toBeVisible();

  const box = await span.boundingBox();

  if (box === null) {
    throw new Error("The text to select is not on screen.");
  }

  const middle = box.y + box.height / 2;

  await page.mouse.move(box.x + 1, middle);
  await page.mouse.down();
  // `overshoot` carries the drag past the end of the text into empty page, which is how
  // most people select a line -- and what used to collapse the selection to nothing.
  await page.mouse.move(box.x + box.width - 1 + overshoot, middle, { steps: 8 });
  await page.mouse.up();
}
