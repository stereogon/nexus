/**
 * Zod schema for `manifest.json`.
 *
 * Strict objects, matching `deny_unknown_fields` in `manifest.rs`. The cross-field rules
 * that `Source::new` enforces are mirrored here, because they are the ones whose
 * violation would show a person something untrue — a lecture claiming a conversion
 * succeeded while keeping no original to reconvert from, for instance.
 */
import * as z from "zod";

import {
  FingerprintSchema,
  LabelSchema,
  OrderKeySchema,
  RelativePathSchema,
  TimestampSchema,
} from "./primitives.js";

/**
 * The version of `manifest.json` this build reads and writes.
 *
 * A literal rather than a span, unlike `MANIFEST_SCHEMA` in Rust, and that asymmetry is
 * deliberate: Rust owns the filesystem and upgrades a version 1 manifest as it reads it,
 * so a manifest arriving over IPC has already been brought to the current version. The UI
 * never reads a bundle off disk, so accepting an older one here would only hide a bug in
 * the layer that should have upgraded it.
 */
export const MANIFEST_SCHEMA_VERSION = 4;

/** Keys the facet map reserves for its named facets. */
const RESERVED_FACET_KEYS = new Set(["course", "module", "week", "tags"]);

export const ConversionStateSchema = z.enum([
  "notRequired",
  "queued",
  "converting",
  "ready",
  "failed",
]);

export type ConversionState = z.infer<typeof ConversionStateSchema>;

export const ConversionSchema = z.strictObject({
  state: ConversionStateSchema,
  converter: LabelSchema.optional(),
  convertedAt: TimestampSchema.optional(),
});

export const SourceSchema = z
  .strictObject({
    /** The PDF the viewer renders. Always a PDF -- it is the canonical render format. */
    document: RelativePathSchema,
    /**
     * A fingerprint of the rendered PDF, once something has read it.
     *
     * Absent means "not yet computed", which is not the same as "unchanged" -- annotation
     * geometry is normalised against this document's pages, so a PDF that changed under a
     * set of highlights puts them in the wrong place, and not knowing must never be shown
     * as being fine.
     */
    documentFingerprint: FingerprintSchema.optional(),
    /** The file as imported, kept so reconversion stays possible. */
    original: RelativePathSchema.optional(),
    /** A fingerprint of that imported file, which is what makes "reconvert?" answerable. */
    originalFingerprint: FingerprintSchema.optional(),
    conversion: ConversionSchema,
  })
  .refine(
    ({ conversion, original }) =>
      conversion.state !== "ready" || original !== undefined,
    "a finished conversion must keep the original it came from",
  )
  .refine(
    ({ conversion }) =>
      conversion.state !== "ready" ||
      (conversion.converter !== undefined && conversion.convertedAt !== undefined),
    "a finished conversion must say what converted it and when",
  )
  .refine(
    ({ conversion }) =>
      conversion.state !== "notRequired" ||
      (conversion.converter === undefined && conversion.convertedAt === undefined),
    "a document that needed no conversion cannot name a converter",
  )
  .refine(
    ({ document, original }) => original === undefined || original !== document,
    "the original and the rendered document cannot be the same file",
  )
  .refine(
    ({ original, originalFingerprint }) =>
      originalFingerprint === undefined || original !== undefined,
    "a fingerprint was recorded for an original file that is not there",
  );

export const FacetsSchema = z
  .strictObject({
    course: LabelSchema.optional(),
    module: LabelSchema.optional(),
    week: LabelSchema.optional(),
    /** A sorted set on disk, so two devices writing the same tags produce one file. */
    tags: z.array(LabelSchema).default([]),
    custom: z.record(z.string(), LabelSchema).default({}),
  })
  .refine(
    ({ custom }) => Object.keys(custom).every((key) => !RESERVED_FACET_KEYS.has(key)),
    "a custom facet cannot reuse a reserved key",
  );

export type Facets = z.infer<typeof FacetsSchema>;

export const ManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
    title: LabelSchema,
    /** Its number in the course (version 3). Absent, not null, when it has none. */
    number: z.string().min(1).max(12).optional(),
    /** The authoritative order. A `01-` folder prefix is only a projection of this. */
    sequence: OrderKeySchema,
    facets: FacetsSchema,
    /** Absent for a plain note (version 4), which has no document beside its notes. */
    source: SourceSchema.optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .refine(
    ({ createdAt, updatedAt }) => createdAt <= updatedAt,
    "changed before it was created",
  );

export type Manifest = z.infer<typeof ManifestSchema>;

export type Source = z.infer<typeof SourceSchema>;

/**
 * Whether `source.document` is a file that exists rather than one a conversion has still
 * to produce.
 *
 * Mirrors `Source::document_is_ready` in `source.rs`, and exists for the same reason:
 * otherwise every caller matches on the conversion state and one of them gets it wrong.
 * While a conversion is queued, running or failed, `document` names the PDF that *will*
 * be written — the path is a promise, not a fact — and handing it to the viewer would
 * show an error or, worse, a fragment that can be annotated.
 */
export function documentIsReady(source: Source): boolean {
  return (
    source.conversion.state === "notRequired" || source.conversion.state === "ready"
  );
}
