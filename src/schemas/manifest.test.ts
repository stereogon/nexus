/**
 * What `manifest.json` must and must not accept.
 *
 * Every case here is a file a person could hand-edit into existence, and each mirrors a
 * cross-field rule in `source.rs` or `manifest.rs`. The two descriptions of one shape are
 * deliberately duplicated rather than generated: a rule that holds in only one of the two
 * languages is the bug this pair exists to catch.
 */
import { describe, expect, it } from "vitest";

import manifestFixture from "../../fixtures/manifest.json";

import { ManifestSchema } from "./manifest.js";

/** Replaces one key of a parsed fixture, leaving the rest intact. */
function withChange(
  base: Record<string, unknown>,
  change: Record<string, unknown>,
): unknown {
  return { ...base, ...change };
}

describe("the manifest schema", () => {
  it("refuses a file from another schema version", () => {
    // Version 2 is now current, so the rejected cases are either side of it. The UI only
    // ever sees manifests that Rust has already brought to the current version, so
    // accepting an older one here would hide a bug in the layer that should have
    // upgraded it.
    for (const schemaVersion of [1, 3, 0]) {
      const other = withChange(manifestFixture, { schemaVersion });

      expect(ManifestSchema.safeParse(other).success).toBe(false);
    }
  });

  it("reads the fingerprints the fixture records", () => {
    const parsed = ManifestSchema.parse(manifestFixture);

    expect(parsed.source.documentFingerprint).toBe("f3bd4bed30facb27");
    expect(parsed.source.originalFingerprint).toBe("d56fdfd66303cc7c");
  });

  it("accepts a source with no fingerprints yet", () => {
    // Absent is a real state: nothing has read the files. It must not be confused with
    // "unchanged", and it must not be a parse failure either, since every version 1
    // manifest upgrades into exactly this shape.
    const unread = withChange(manifestFixture, {
      source: {
        document: "source/document.pdf",
        original: "source/original.pptx",
        conversion: {
          state: "ready",
          converter: "libreoffice",
          convertedAt: "2026-10-27T16:00:00Z",
        },
      },
    });

    const parsed = ManifestSchema.parse(unread);

    expect(parsed.source.documentFingerprint).toBeUndefined();
    expect(parsed.source.originalFingerprint).toBeUndefined();
  });

  it("refuses a fingerprint that is not one", () => {
    // Sixteen lowercase hex characters exactly. A loosely accepted fingerprint could
    // compare unequal to the same file's real one and prompt a needless reconversion.
    for (const documentFingerprint of [
      "",
      "f3bd4bed30facb2",
      "f3bd4bed30facb277",
      "F3BD4BED30FACB27",
      "f3bd4bed30facb2g",
      "0xf3bd4bed30facb2",
    ]) {
      const bad = withChange(manifestFixture, {
        source: { ...manifestFixture.source, documentFingerprint },
      });

      expect(ManifestSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("refuses a fingerprint recorded for an original that is not there", () => {
    // Mirrors Source::with_fingerprints. A fingerprint with nothing to be a fingerprint
    // of would let a later "has the original changed?" check compare against a file that
    // does not exist.
    const orphan = withChange(manifestFixture, {
      source: {
        document: "source/document.pdf",
        originalFingerprint: "d56fdfd66303cc7c",
        conversion: { state: "notRequired" },
      },
    });

    expect(ManifestSchema.safeParse(orphan).success).toBe(false);
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

