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
 *
 * Only the cross-cutting contract lives here. The two file formats have a test file each
 * -- `manifest.test.ts` and `annotations.test.ts` -- because this file was over the
 * 300-line limit and holding three subjects that fail for different reasons.
 */
import { describe, expect, it } from "vitest";

import annotationsFixture from "../../fixtures/annotations.json";
import manifestFixture from "../../fixtures/manifest.json";

import { AnnotationSetSchema } from "./annotations.js";
import { ManifestSchema } from "./manifest.js";
import { TimestampSchema } from "./primitives.js";

describe("the committed wire format", () => {
  it("is accepted by the manifest schema exactly as Rust wrote it", () => {
    const manifest = ManifestSchema.parse(manifestFixture);

    expect(manifest.title).toBe("Raft Consensus");
    expect(manifest.sequence).toBe("a0");
    expect(manifest.facets.course).toBe("CS454 Distributed Systems");
    // Written as a sorted set, so two devices adding the same tags produce one file.
    expect(manifest.facets.tags).toEqual(["consensus", "exam"]);
    expect(manifest.facets.custom).toEqual({ lecturer: "Dr Ada Lovelace" });
    expect(manifest.source?.conversion.state).toBe("ready");
    expect(manifest.source?.original).toBe("source/original.pptx");
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
