/**
 * What the notes can show rendered, found in the text.
 */
import { describe, expect, it } from "vitest";

import citationsFixture from "../../../fixtures/citations.json";
import { findPreviews } from "./find";

const kinds = (doc: string) => findPreviews(doc).map((preview) => preview.kind);

describe("citations", () => {
  it("are found for every line Rust writes", () => {
    // The fixture is `lecture_core::citation_block`'s own output, so the renderer and the
    // writer cannot disagree about what a citation looks like.
    for (const { block } of citationsFixture) {
      const [found] = findPreviews(block);

      expect(found?.kind).toBe("citation");
    }
  });

  it("carry the page, the id and the quote with its escaping taken off", () => {
    const awkward = citationsFixture.find((entry) => entry.block.includes("\\*"));
    const [found] = findPreviews(awkward?.block ?? "");

    expect(found).toMatchObject({
      kind: "citation",
      page: 12,
      id: "hl-0e1d2c3b",
      quote: "Why is x*y < z_1 in `fold` [see 3] and C:\\tmp?",
    });
  });

  it("carry no quote for an area with nothing to quote", () => {
    const [found] = findPreviews("> 📌 **[Page 9](cite://ar-9z8y7x6w)**");

    expect(found).toMatchObject({ kind: "citation", quote: null });
  });

  it("span exactly their line", () => {
    const doc = "Intro\n> 📌 **[Page 4](cite://hl-1)**: *\"Raft\"*\nAfter";
    const [found] = findPreviews(doc);

    expect(doc.slice(found?.from, found?.to)).toBe('> 📌 **[Page 4](cite://hl-1)**: *"Raft"*');
  });
});

describe("maths", () => {
  it("finds inline maths", () => {
    const [found] = findPreviews("Euler: $e^{i\\pi} + 1 = 0$ is neat.");

    expect(found).toMatchObject({ kind: "math", tex: "e^{i\\pi} + 1 = 0", display: false });
  });

  it("does not mistake prices for maths", () => {
    expect(kinds("It costs $5 and $6, or $ 7 $.")).toEqual([]);
  });

  it("does not render an escaped dollar", () => {
    expect(kinds("A literal \\$x$ stays.")).toEqual([]);
  });

  it("finds a display block across lines", () => {
    const doc = "Before\n$$\n\\nabla \\cdot E = \\frac{\\rho}{\\varepsilon_0}\n$$\nAfter";
    const [found] = findPreviews(doc);

    expect(found).toMatchObject({ kind: "math", display: true, tex: "\\nabla \\cdot E = \\frac{\\rho}{\\varepsilon_0}" });
    expect(doc.slice(found?.from, found?.to)).toBe("$$\n\\nabla \\cdot E = \\frac{\\rho}{\\varepsilon_0}\n$$");
  });

  it("finds a display block written on one line", () => {
    expect(findPreviews("$$ a^2 + b^2 = c^2 $$")).toMatchObject([{ kind: "math", display: true, tex: "a^2 + b^2 = c^2" }]);
  });

  it("leaves maths inside inline code alone", () => {
    expect(kinds("Type `$x$` to get maths.")).toEqual([]);
  });
});

describe("fenced blocks", () => {
  it("finds a mermaid diagram with its source", () => {
    const doc = "```mermaid\ngraph TD\n  A --> B\n```";

    expect(findPreviews(doc)).toEqual([{ kind: "mermaid", from: 0, to: doc.length, source: "graph TD\n  A --> B" }]);
  });

  it("finds a chart", () => {
    expect(kinds('```chart\n{"type":"bar"}\n```')).toEqual(["chart"]);
  });

  it("renders nothing inside an ordinary code block", () => {
    // A code sample about maths or citations is an example, not content.
    const doc = "```text\n$x$ and > 📌 **[Page 1](cite://hl-1)**\n![a](assets/b.png)\n```";

    expect(kinds(doc)).toEqual([]);
  });

  it("does not render an unfinished diagram while it is being typed", () => {
    expect(kinds("```mermaid\ngraph TD\n  A --> B")).toEqual([]);
  });
});

describe("images", () => {
  it("finds an image with its alt text and path", () => {
    expect(findPreviews("See ![the Raft log](assets/20261105-ab12.png) here.")).toMatchObject([
      { kind: "image", alt: "the Raft log", src: "assets/20261105-ab12.png" },
    ]);
  });

  it("finds several on one line, in order", () => {
    expect(findPreviews("![a](assets/a.png) and ![b](assets/b.png)").map((preview) => preview.kind)).toEqual(["image", "image"]);
  });
});

describe("a mixed note", () => {
  it("finds each construct where it is, in document order", () => {
    const doc = [
      "# Week 2",
      '> 📌 **[Page 4](cite://hl-1)**: *"Raft"*',
      "Energy $E = mc^2$ and ![fig](assets/f.png).",
      "```mermaid",
      "graph LR; A-->B",
      "```",
    ].join("\n");

    expect(kinds(doc)).toEqual(["citation", "math", "image", "mermaid"]);
  });
});
