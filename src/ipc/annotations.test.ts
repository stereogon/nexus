/**
 * The other half of the annotation contract.
 *
 * `fixtures/annotations.json` is written by the Rust tests from the real
 * `AnnotationSet`, and this asserts the Zod schema accepts those exact bytes. A schema
 * written by reading the Rust enum agrees with it only until someone edits one of them.
 *
 * The fixture is the whole on-disk file, so it carries a `schemaVersion` the IPC payload
 * does not: `load_annotations` returns the array alone. Parsing `annotations` out of it is
 * therefore the right half to check, and it is also the half a person's work lives in.
 */
import { describe, expect, it } from "vitest";

import annotationsFixture from "../../fixtures/annotations.json";
import {
  AnnotationSchema,
  HighlightSemanticSchema,
  NormalizedRectSchema,
} from "./annotations";

const STORED = annotationsFixture.annotations;

describe("the annotation contract", () => {
  it("accepts every kind the domain can store", () => {
    const parsed = STORED.map((stored) => AnnotationSchema.parse(stored));

    expect(parsed.map((annotation) => annotation.kind)).toEqual([
      "textHighlight",
      "areaHighlight",
      "textBox",
    ]);
  });

  it("reads a text highlight's lines, semantic and quote", () => {
    const parsed = AnnotationSchema.parse(STORED[0]);

    if (parsed.kind !== "textHighlight") {
      throw new Error("the first fixture annotation should be a text highlight");
    }

    expect(parsed.semantic).toBe("key");
    expect(parsed.quote).toContain("elected leader");
    // Two rectangles, because the quote wraps across two lines. One rect per line is the
    // shape Rust wants and the shape that draws without seams.
    expect(parsed.rects).toHaveLength(2);
    expect(parsed.page).toBe(4);
  });

  it("reads an area highlight's region and keeps its caption optional", () => {
    const parsed = AnnotationSchema.parse(STORED[1]);

    if (parsed.kind !== "areaHighlight") {
      throw new Error("the second fixture annotation should be an area highlight");
    }

    expect(parsed.region.width).toBeCloseTo(0.4, 10);
    expect(parsed.caption).toBe("The leader election state machine");
  });

  it("reads a text box, which carries no semantic at all", () => {
    const parsed = AnnotationSchema.parse(STORED[2]);

    expect(parsed.kind).toBe("textBox");
    // Not "a semantic that happens to be absent": a text box is not a highlight, and the
    // union says so rather than leaving a field to check.
    expect("semantic" in parsed).toBe(false);
  });
});

describe("what the schema refuses", () => {
  it("refuses a text highlight covering no rectangle", () => {
    // The invariant Rust's constructor and deserialiser both enforce. An empty list here
    // would draw nothing and could never be clicked, so it must not parse.
    const empty = { ...STORED[0], rects: [] };

    expect(AnnotationSchema.safeParse(empty).success).toBe(false);
  });

  it("refuses a kind neither side knows", () => {
    const unknown = { ...STORED[0], kind: "inkStroke" };

    expect(AnnotationSchema.safeParse(unknown).success).toBe(false);
  });

  it("refuses a semantic neither side knows, rather than falling back", () => {
    // A semantic read as "key" when it said something else would mislabel exam material.
    expect(HighlightSemanticSchema.safeParse("yellow").success).toBe(false);
    expect(HighlightSemanticSchema.safeParse("").success).toBe(false);
  });

  it("refuses a page of zero, since pages count from one", () => {
    expect(AnnotationSchema.safeParse({ ...STORED[0], page: 0 }).success).toBe(false);
  });

  it("refuses a coordinate outside the page", () => {
    for (const bad of [
      { x: -0.5, y: 0.1, width: 0.2, height: 0.1 },
      { x: 1.5, y: 0.1, width: 0.2, height: 0.1 },
      { x: 0.1, y: 0.1, width: 2, height: 0.1 },
    ]) {
      expect(NormalizedRectSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("accepts a rectangle ending a hair past the edge", () => {
    // The tolerance mirrors Rust's. A selection of the last word on a line arrives as
    // 1.0000000000000002 after several float transforms, and refusing it would drop a
    // legitimate highlight.
    const grazing = { x: 0, y: 0, width: 1.000_000_000_000_000_2, height: 0.1 };

    expect(NormalizedRectSchema.safeParse(grazing).success).toBe(true);
  });

  it("refuses a rectangle whose numbers are not numbers", () => {
    for (const bad of [
      { x: "0.1", y: 0.1, width: 0.2, height: 0.1 },
      { x: Number.NaN, y: 0.1, width: 0.2, height: 0.1 },
      { y: 0.1, width: 0.2, height: 0.1 },
    ]) {
      expect(NormalizedRectSchema.safeParse(bad).success).toBe(false);
    }
  });
});
