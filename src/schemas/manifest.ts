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
  LabelSchema,
  OrderKeySchema,
  RelativePathSchema,
  TimestampSchema,
} from "./primitives.js";

/** The version of `manifest.json` this build reads and writes. */
export const MANIFEST_SCHEMA_VERSION = 1;

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
    /** The file as imported, kept so reconversion stays possible. */
    original: RelativePathSchema.optional(),
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
    /** The authoritative order. A `01-` folder prefix is only a projection of this. */
    sequence: OrderKeySchema,
    facets: FacetsSchema,
    source: SourceSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .refine(
    ({ createdAt, updatedAt }) => createdAt <= updatedAt,
    "changed before it was created",
  );

export type Manifest = z.infer<typeof ManifestSchema>;
