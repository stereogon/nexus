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
  it("is what it was drawn from, for bold, italic, strikethrough and code", () => {
    const element = document.createElement("div");
    const text = "fed with **ambiguity**, _contradiction_, ~~struck~~ and `code`";

    drawCell(element, text);

    expect(element.textContent).toBe("fed with ambiguity, contradiction, struck and code");
    expect(cellMarkdown(element)).toBe(text);
  });

  it("reads the browser's own bold, italic and strikethrough, as tags or as styles; italic as the notes' `_`", () => {
    expect(cellMarkdown(cell("<b>a</b> <i>b</i> <span style=\"font-weight: bold\">c</span> <del>d</del>"))).toBe("**a** _b_ **c** ~~d~~");
    expect(cellMarkdown(cell("<strong><em>both</em></strong>"))).toBe("**_both_**");
  });

  it("draws formats inside one another nested, and reads them back the same", () => {
    const element = document.createElement("div");

    drawCell(element, "**_both_** and _**again**_ and `**literal**`");

    expect(element.textContent).toBe("both and again and **literal**");
    expect(element.querySelector("strong em")?.textContent).toBe("both");
    expect(cellMarkdown(element)).toBe("**_both_** and _**again**_ and `**literal**`");
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
