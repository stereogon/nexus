// @vitest-environment jsdom
/**
 * Mapping a match's offsets onto a drawn text layer's nodes. In jsdom, which has the DOM but
 * no layout: where the boxes land is checked by the Playwright journey, in WebKit.
 */
import { describe, expect, it } from "vitest";

import { textRange } from "./find";

describe("the text a match covers on a drawn page", () => {
  // The text layer: one span per run, as pdf.js draws it, with a line break between.
  function layer(): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = "<span>Raft elects </span><br><span>a leader.</span><div class=\"endOfContent\"></div>";
    return root;
  }

  it("covers a match within one run", () => {
    expect(textRange(layer(), 0, 4)?.toString()).toBe("Raft");
  });

  it("covers a match that crosses from one run into the next", () => {
    expect(textRange(layer(), 5, 8)?.toString()).toBe("elects a");
  });

  it("covers a match that ends at the very end of the text", () => {
    expect(textRange(layer(), 14, 7)?.toString()).toBe("leader.");
  });

  it("is nothing for a match past the text, as on a layer still being drawn", () => {
    expect(textRange(layer(), 15, 40)).toBeNull();
  });
});
