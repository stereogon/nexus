// @vitest-environment jsdom
/**
 * Finding the page a selection started on.
 *
 * This half needs a DOM but not a layout engine, which is exactly the slice jsdom can
 * check: climbing from a text node to the page element and reading its index. Where the
 * highlight lands still cannot be checked here, and is not pretended to be.
 */
import { afterEach, describe, expect, it } from "vitest";

import { PAGE_INDEX_ATTRIBUTE, candidateFrom, pageIndexOf } from "./selection";

afterEach(() => {
  document.body.replaceChildren();
});

/** A page element holding one line of text, as `PdfPage` renders it. */
function page(index: string): { page: HTMLElement; text: Text } {
  const element = document.createElement("div");

  element.className = "pdf-page";
  element.setAttribute(PAGE_INDEX_ATTRIBUTE, index);

  // Nested, because pdf.js builds a span per text run inside the layer -- the selection
  // arrives as a text node several levels below the page.
  const layer = document.createElement("div");
  const span = document.createElement("span");
  const text = document.createTextNode("Raft achieves consensus.");

  span.append(text);
  layer.append(span);
  element.append(layer);
  document.body.append(element);

  return { page: element, text };
}

describe("finding the page", () => {
  it("climbs from a text node to the page it is on", () => {
    const { text } = page("3");

    expect(pageIndexOf(text)).toBe(3);
  });

  it("reads it from an element as happily as from a text node", () => {
    const { page: element } = page("7");

    expect(pageIndexOf(element)).toBe(7);
  });

  it("finds page zero, which is a real page and not a missing one", () => {
    const { text } = page("0");

    expect(pageIndexOf(text)).toBe(0);
  });

  it("says nothing for a node that is not on a page", () => {
    // Selecting a lecture title in the sidebar is an ordinary thing to do, and it must
    // not produce a highlight on page 1.
    const elsewhere = document.createElement("p");

    elsewhere.textContent = "CS454";
    document.body.append(elsewhere);

    expect(pageIndexOf(elsewhere)).toBeNull();
    expect(pageIndexOf(elsewhere.firstChild)).toBeNull();
  });

  it("says nothing for nothing", () => {
    expect(pageIndexOf(null)).toBeNull();
  });

  it("refuses an index that is not a whole page number", () => {
    for (const written of ["", "   ", "two", "-1", "1.5", "1px", "NaN"]) {
      const { text } = page(written);

      expect(pageIndexOf(text)).toBeNull();
      document.body.replaceChildren();
    }
  });

  it("refuses a blank index rather than reading it as page one", () => {
    // `Number("")` is `0`, so a present-but-blank attribute would otherwise be a
    // perfectly good page 1 and a highlight would be stored against the wrong page.
    const { text } = page("");

    expect(pageIndexOf(text)).toBeNull();
  });
});

describe("what makes no candidate at all", () => {
  it("makes nothing from no selection", () => {
    expect(candidateFrom(null)).toBeNull();
  });

  it("makes nothing from a cursor sitting in the text", () => {
    // A click is a collapsed selection. Offering a highlight menu on every click would
    // make reading the document impossible.
    const { text } = page("2");
    const selection = window.getSelection();
    const range = document.createRange();

    range.setStart(text, 4);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(candidateFrom(selection)).toBeNull();
  });

  it("makes nothing from a selection outside any page", () => {
    const elsewhere = document.createElement("p");

    elsewhere.textContent = "Open another vault";
    document.body.append(elsewhere);

    const selection = window.getSelection();
    const range = document.createRange();

    range.selectNodeContents(elsewhere);
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(candidateFrom(selection)).toBeNull();
  });
});
