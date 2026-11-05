// @vitest-environment jsdom
/**
 * The bookkeeping half of the selection aid: the element it adds, the class it toggles,
 * and that releasing a layer leaves nothing behind.
 *
 * Whether a drag past the end of a line actually stays selected is a question about
 * WebKit's hit-testing, which jsdom does not have. That half is the Playwright journey
 * "a drag past the end of the line still selects it", proven by disabling this module.
 */
import { afterEach, describe, expect, it } from "vitest";

import { keepSelectionWhole } from "./textLayerSelection";

const released: (() => void)[] = [];

afterEach(() => {
  for (const release of released.splice(0)) {
    release();
  }
  document.body.replaceChildren();
});

function layerWithText(): HTMLElement {
  const layer = document.createElement("div");
  const span = document.createElement("span");

  layer.className = "textLayer";
  span.textContent = "Page 1 heading";
  layer.append(span);
  document.body.append(layer);

  return layer;
}

function track(layer: HTMLElement): () => void {
  const release = keepSelectionWhole(layer);

  released.push(release);

  return release;
}

describe("a tracked layer", () => {
  it("ends with the element a drag past the text lands on", () => {
    const layer = layerWithText();

    track(layer);

    expect(layer.lastElementChild?.className).toBe("endOfContent");
  });

  it("is marked as selecting when the mouse goes down in it", () => {
    const layer = layerWithText();

    track(layer);
    layer.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(layer.classList.contains("selecting")).toBe(true);
  });

  it("is put back when the pointer comes up", () => {
    const layer = layerWithText();

    track(layer);
    layer.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.dispatchEvent(new Event("pointerup"));

    expect(layer.classList.contains("selecting")).toBe(false);
    expect(layer.lastElementChild?.className).toBe("endOfContent");
  });

  it("is put back when the window loses focus mid-drag", () => {
    // Otherwise switching apps with the button held leaves a layer stretched over the
    // page, swallowing clicks, until the next drag happens to reset it.
    const layer = layerWithText();

    track(layer);
    layer.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    window.dispatchEvent(new Event("blur"));

    expect(layer.classList.contains("selecting")).toBe(false);
  });
});

describe("releasing a layer", () => {
  it("removes the element it added", () => {
    const layer = layerWithText();

    track(layer)();

    expect(layer.querySelector(".endOfContent")).toBeNull();
  });

  it("stops answering the mouse", () => {
    const layer = layerWithText();

    track(layer)();
    layer.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(layer.classList.contains("selecting")).toBe(false);
  });

  it("leaves the other layers working", () => {
    // Pages mount and unmount as the document scrolls, so one page going away while
    // another is still on screen is the ordinary case, not an edge.
    const leaving = layerWithText();
    const staying = layerWithText();

    track(leaving)();
    track(staying);
    staying.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.dispatchEvent(new Event("pointerup"));

    expect(staying.classList.contains("selecting")).toBe(false);
    expect(staying.lastElementChild?.className).toBe("endOfContent");
  });
});
