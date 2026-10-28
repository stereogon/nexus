/**
 * What `annotations.json` must and must not accept, and the values derived from it.
 *
 * The derived helpers are here rather than beside the schema tests because they are only
 * meaningful against a parsed set: `boundingRect` and `annotationText` answer questions
 * about real annotation geometry, and the fixture is where that geometry comes from.
 */
import { describe, expect, it } from "vitest";

import annotationsFixture from "../../fixtures/annotations.json";

import {
  AnnotationSetSchema,
  annotationText,
  boundingRect,
  semanticGlyph,
  type Annotation,
} from "./annotations.js";
import { NormalizedRectSchema } from "./primitives.js";

/** Replaces one key of a parsed fixture, leaving the rest intact. */
function withChange(
  base: Record<string, unknown>,
  change: Record<string, unknown>,
): unknown {
  return { ...base, ...change };
}

describe("the annotation schema", () => {
  const base = AnnotationSetSchema.parse(annotationsFixture);

  function setOf(...annotations: unknown[]): unknown {
    return { schemaVersion: 1, annotations };
  }

  /**
   * The fixture's first annotation, as a plain record to vary.
   *
   * Throws rather than asserting non-null: `noUncheckedIndexedAccess` is on, so the
   * element really is `| undefined` to the compiler, and a fixture that lost its
   * annotations should fail loudly here instead of being silenced with a `!`.
   */
  function firstAnnotation(): Record<string, unknown> {
    const [first] = base.annotations;
    if (first === undefined) {
      throw new Error("the annotations fixture should not be empty");
    }
    return first;
  }

  it("refuses a text highlight that covers nothing", () => {
    const highlight = firstAnnotation();
    const empty = withChange(highlight, { rects: [] });

    expect(AnnotationSetSchema.safeParse(setOf(empty)).success).toBe(false);
  });

  it("refuses page zero, because documents are numbered from 1", () => {
    const highlight = firstAnnotation();
    const zero = withChange(highlight, { page: 0 });

    expect(AnnotationSetSchema.safeParse(setOf(zero)).success).toBe(false);
  });

  it("refuses a rectangle that runs off the page", () => {
    const highlight = firstAnnotation();
    const offPage = withChange(highlight, {
      rects: [{ x: 0.9, y: 0.1, width: 0.5, height: 0.1 }],
    });

    expect(AnnotationSetSchema.safeParse(setOf(offPage)).success).toBe(false);
  });

  it("refuses two annotations sharing an identifier", () => {
    const highlight = firstAnnotation();

    expect(AnnotationSetSchema.safeParse(setOf(highlight, highlight)).success).toBe(
      false,
    );
  });

  it("refuses an unknown semantic", () => {
    const highlight = firstAnnotation();
    const purple = withChange(highlight, { semantic: "purple" });

    expect(AnnotationSetSchema.safeParse(setOf(purple)).success).toBe(false);
  });

  it("refuses a text highlight carrying another kind's field", () => {
    // The whole reason for a discriminated union over one wide record.
    const highlight = firstAnnotation();
    const confused = withChange(highlight, { text: "stray" });

    expect(AnnotationSetSchema.safeParse(setOf(confused)).success).toBe(false);
  });
});


describe("derived values", () => {
  const set = AnnotationSetSchema.parse(annotationsFixture);

  function find(kind: Annotation["kind"]): Annotation {
    const found = set.annotations.find((a) => a.kind === kind);
    if (found === undefined) {
      throw new Error(`the fixture should contain a ${kind}`);
    }
    return found;
  }

  it("folds a multi-line highlight into one bounding box", () => {
    // The fixture's text highlight spans two lines: x from 0.098 to 0.754, y from 0.285
    // to 0.353.
    const box = boundingRect(find("textHighlight"));

    expect(box.x).toBeCloseTo(0.098, 9);
    expect(box.y).toBeCloseTo(0.285, 9);
    expect(box.x + box.width).toBeCloseTo(0.754, 9);
    expect(box.y + box.height).toBeCloseTo(0.353, 9);
  });

  it("produces a bounding box that is itself a valid rectangle", () => {
    for (const annotation of set.annotations) {
      expect(NormalizedRectSchema.safeParse(boundingRect(annotation)).success).toBe(
        true,
      );
    }
  });

  it("bounds an area highlight and a text box by their own region", () => {
    expect(boundingRect(find("areaHighlight"))).toEqual({
      x: 0.2,
      y: 0.3,
      width: 0.4,
      height: 0.25,
    });
  });

  it("exposes each kind's text without the caller knowing the kind", () => {
    expect(annotationText(find("textHighlight"))).toContain("elected leader");
    expect(annotationText(find("areaHighlight"))).toBe(
      "The leader election state machine",
    );
    expect(annotationText(find("textBox"))).toContain("2-phase commit");
  });

  it("gives every semantic a distinct glyph", () => {
    const glyphs = Object.values(semanticGlyph);

    expect(glyphs).toEqual(["K", "D", "E", "Q"]);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

