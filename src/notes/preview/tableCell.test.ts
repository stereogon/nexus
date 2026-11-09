// @vitest-environment jsdom
/**
 * A cell's words read back out of the formatted text they are edited as.
 */
import { describe, expect, it } from "vitest";

import { cellMarkdown, drawCell } from "./tableCell";

const cell = (html: string) => {
  const element = document.createElement("div");

  element.innerHTML = html;
  return element;
};

describe("a cell's Markdown", () => {
  it("is what it was drawn from, for bold, italic and code", () => {
    const element = document.createElement("div");
    const text = "fed with **ambiguity**, *contradiction* and `code`";

    drawCell(element, text);

    expect(element.textContent).toBe("fed with ambiguity, contradiction and code");
    expect(cellMarkdown(element)).toBe(text);
  });

  it("reads the browser's own bold and italic, as tags or as styles", () => {
    expect(cellMarkdown(cell("<b>a</b> <i>b</i> <span style=\"font-weight: bold\">c</span>"))).toBe("**a** *b* **c**");
    expect(cellMarkdown(cell("<strong><em>both</em></strong>"))).toBe("***both***");
  });

  it("keeps spaces at a mark's edge outside it, where GFM needs them", () => {
    expect(cellMarkdown(cell("a<strong> bold </strong>b"))).toBe("a **bold** b");
  });

  it("writes no marks around nothing", () => {
    expect(cellMarkdown(cell("a<strong></strong><em> </em><code></code>"))).toBe("a ");
  });

  it("is one line: a break inside is a space, and the trailing one is dropped", () => {
    expect(cellMarkdown(cell("one<br>two<br>"))).toBe("one two");
    expect(cellMarkdown(cell("one\ntwo"))).toBe("one two");
  });
});
