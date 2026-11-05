/**
 * The citation line, held to `lecture_core::citation_block` by the fixture Rust writes.
 */
import { describe, expect, it } from "vitest";

import citationsFixture from "../../fixtures/citations.json";
import { AnnotationSchema } from "../ipc/annotations";
import { citationBlock } from "./citation";

describe("the line Link to Notes inserts", () => {
  it("is exactly what Rust writes, for every case in the fixture", () => {
    for (const { annotation, block } of citationsFixture) {
      expect(citationBlock(AnnotationSchema.parse(annotation))).toBe(block);
    }
  });

  it("covers the cases where two formatters would drift", () => {
    // Guards the fixture itself: if these fall out of it, the test above proves less.
    const blocks = citationsFixture.map((entry) => entry.block);

    expect(blocks.some((block) => !block.includes(": *"))).toBe(true);
    expect(blocks.some((block) => block.includes("\\*") && block.includes("\\["))).toBe(true);
  });
});
