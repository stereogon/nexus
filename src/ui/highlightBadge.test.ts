/**
 * Where the glyph sits, and that the four semantics stay in step with the schema.
 */
import { describe, expect, it } from "vitest";

import { HighlightSemanticSchema } from "../ipc/annotations";
import { BADGE_SIZE, badgeAt } from "./highlightBadge";
import { SEMANTIC_GLYPH, SEMANTIC_LABEL, SEMANTICS } from "./semantics";

const PAGE = { width: 800, height: 1000 };

describe("placing the badge", () => {
  it("puts it just past the end of the last line", () => {
    const at = badgeAt([{ x: 0.1, y: 0.2, width: 0.3, height: 0.03 }], PAGE);

    expect(at?.left).toBeCloseTo(0.4 * 800 + 2, 10);
    expect(at?.top).toBeCloseTo(0.2 * 1000, 10);
  });

  it("follows the last line of a wrapped highlight, not the first", () => {
    const at = badgeAt(
      [
        { x: 0.1, y: 0.2, width: 0.8, height: 0.03 },
        { x: 0.1, y: 0.24, width: 0.2, height: 0.03 },
      ],
      PAGE,
    );

    expect(at?.top).toBeCloseTo(0.24 * 1000, 10);
  });

  it("keeps it on the page when the highlight runs to the right edge", () => {
    // Otherwise the glyph -- which is the thing that distinguishes the semantics without
    // relying on hue -- falls off the page exactly when the highlight is widest.
    const at = badgeAt([{ x: 0.2, y: 0.5, width: 0.8, height: 0.03 }], PAGE);

    expect(at?.left).toBe(800 - BADGE_SIZE);
  });

  it("keeps it on the page when the highlight is on the last line", () => {
    const at = badgeAt([{ x: 0.1, y: 0.999, width: 0.2, height: 0.001 }], PAGE);

    expect(at?.top).toBe(1000 - BADGE_SIZE);
  });

  it("yields a position rather than a negative one on a page narrower than the badge", () => {
    const at = badgeAt([{ x: 0, y: 0, width: 1, height: 1 }], { width: 8, height: 8 });

    expect(at?.left).toBe(0);
    expect(at?.top).toBe(0);
  });

  it("has nowhere to go with no rectangles", () => {
    // Rust refuses to store a text highlight covering nothing, so this is defensive --
    // but returning null keeps the function total and the caller out of an empty list.
    expect(badgeAt([], PAGE)).toBeNull();
  });

  it("has nowhere to go on a page with no size", () => {
    const rects = [{ x: 0.1, y: 0.2, width: 0.3, height: 0.03 }];

    expect(badgeAt(rects, { width: 0, height: 1000 })).toBeNull();
    expect(badgeAt(rects, { width: 800, height: 0 })).toBeNull();
  });
});

describe("the four semantics", () => {
  it("are exactly the ones the schema accepts", () => {
    // Taken from the Zod enum rather than written out again, and that enum is pinned
    // against Rust's own bytes by the contract test. So a fifth semantic added in the
    // domain reaches the menu by itself instead of being quietly missing from it.
    expect(SEMANTICS).toEqual(HighlightSemanticSchema.options);
  });

  it("each have a name and a letter", () => {
    for (const semantic of SEMANTICS) {
      expect(SEMANTIC_LABEL[semantic]).not.toBe("");
      expect(SEMANTIC_GLYPH[semantic]).toHaveLength(1);
    }
  });

  it("have letters that differ, which is the whole point of having them", () => {
    // §3 requires the glyph so the set does not rely on hue alone. Two semantics sharing
    // a letter would leave someone who cannot tell the red from the green with nothing.
    const glyphs = SEMANTICS.map((semantic) => SEMANTIC_GLYPH[semantic]);

    expect(new Set(glyphs).size).toBe(SEMANTICS.length);
  });

  it("carry the letters the domain names", () => {
    expect(SEMANTICS.map((s) => SEMANTIC_GLYPH[s]).join("")).toBe("KDEQ");
  });
});
