/**
 * The TypeScript half of the wire-format contract.
 *
 * `crates/lecture-core/tests/wire_format.rs` asserts the Rust types still serialise to
 * exactly the bytes in `fixtures/`. This asserts the Zod schemas still accept them. Let
 * either side drift and one of the two fails, so the two descriptions of one shape
 * cannot silently diverge.
 *
 * The fixtures are imported as JSON modules, which is exactly what the app does at
 * runtime: `JSON.parse` the bytes, then hand the result to a schema. `parse` accepts
 * `unknown`, so no cast is involved.
 */
import { describe, expect, it } from "vitest";

import annotationsFixture from "../../fixtures/annotations.json";
import manifestFixture from "../../fixtures/manifest.json";

import {
  AnnotationSetSchema,
  annotationText,
  boundingRect,
  semanticGlyph,
  type Annotation,
} from "./annotations.js";
import { ManifestSchema } from "./manifest.js";
import { NormalizedRectSchema, TimestampSchema } from "./primitives.js";

/** Replaces one key of a parsed fixture, leaving the rest intact. */
function withChange(
  base: Record<string, unknown>,
  change: Record<string, unknown>,
): unknown {
  return { ...base, ...change };
}

describe("the committed wire format", () => {
  it("is accepted by the manifest schema exactly as Rust wrote it", () => {
    const manifest = ManifestSchema.parse(manifestFixture);

    expect(manifest.title).toBe("Raft Consensus");
    expect(manifest.sequence).toBe("a0");
    expect(manifest.facets.course).toBe("CS454 Distributed Systems");
    // Written as a sorted set, so two devices adding the same tags produce one file.
    expect(manifest.facets.tags).toEqual(["consensus", "exam"]);
    expect(manifest.facets.custom).toEqual({ lecturer: "Dr Ada Lovelace" });
    expect(manifest.source.conversion.state).toBe("ready");
    expect(manifest.source.original).toBe("source/original.pptx");
  });

  it("is accepted by the annotation schema exactly as Rust wrote it", () => {
    const set = AnnotationSetSchema.parse(annotationsFixture);

    expect(set.annotations).toHaveLength(3);
    // Ordered by page, then id, so the bytes are deterministic.
    expect(set.annotations.map((a) => a.kind)).toEqual([
      "textHighlight",
      "areaHighlight",
      "textBox",
    ]);
  });

  it("stores the meaning of a highlight and never its colour", () => {
    const raw = JSON.stringify(annotationsFixture);

    expect(raw).toContain('"semantic":"key"');
    expect(raw).not.toContain("color");
    expect(raw).not.toContain("#");
    // Derived on read, so it cannot drift from the rectangles it came from.
    expect(raw).not.toContain("boundingRect");
  });
});

describe("the manifest schema", () => {
  it("refuses a file from another schema version", () => {
    const newer = withChange(manifestFixture, { schemaVersion: 2 });

    expect(ManifestSchema.safeParse(newer).success).toBe(false);
  });

  it("refuses an unknown field rather than silently ignoring it", () => {
    // Matching deny_unknown_fields on the Rust side. A field this build does not know
    // is a file this build does not understand, and understanding it partially is worse.
    const extra = withChange(manifestFixture, { lastOpenedPage: 4 });

    expect(ManifestSchema.safeParse(extra).success).toBe(false);
  });

  it("refuses a manifest changed before it was created", () => {
    const backwards = withChange(manifestFixture, {
      createdAt: "2026-10-28T09:30:00Z",
      updatedAt: "2026-10-27T16:00:00Z",
    });

    expect(ManifestSchema.safeParse(backwards).success).toBe(false);
  });

  it("refuses a finished conversion that kept no original", () => {
    // Otherwise a bad conversion is the end of the road for the imported file.
    const broken = withChange(manifestFixture, {
      source: {
        document: "source/document.pdf",
        conversion: {
          state: "ready",
          converter: "libreoffice",
          convertedAt: "2026-10-27T16:00:00Z",
        },
      },
    });

    expect(ManifestSchema.safeParse(broken).success).toBe(false);
  });

  it("refuses a custom facet that reuses a reserved key", () => {
    const clashing = withChange(manifestFixture, {
      facets: { tags: [], custom: { course: "Something else" } },
    });

    expect(ManifestSchema.safeParse(clashing).success).toBe(false);
  });
});

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

describe("timestamps", () => {
  it("accepts only the canonical form Rust writes", () => {
    expect(TimestampSchema.safeParse("2026-10-27T16:00:00Z").success).toBe(true);

    for (const bad of [
      "2026-10-27T16:00:00+01:00",
      "2026-10-27 16:00:00Z",
      "2026-10-27T16:00:00.500Z",
      "2026-10-27",
    ]) {
      expect(TimestampSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("sorts chronologically as plain strings", () => {
    // The reason for the canonical form: byte order is chronological order, so sorting
    // needs no date library on either side of the IPC boundary.
    const sorted = ["2026-10-28T09:30:00Z", "2026-01-01T00:00:00Z", "2026-10-27T16:00:00Z"].sort();

    expect(sorted).toEqual([
      "2026-01-01T00:00:00Z",
      "2026-10-27T16:00:00Z",
      "2026-10-28T09:30:00Z",
    ]);
  });
});
