/**
 * Zod schemas for the validated value types that `lecture-core` writes.
 *
 * # How strict these are, and why
 *
 * Every payload read from disk or over IPC is validated before use (CLAUDE.md section
 * 4), because a corrupted or hand-edited file must never crash the UI. But these schemas
 * are deliberately *weaker* than the Rust types that produce the data, and the asymmetry
 * is the point:
 *
 * - They check what would **misrender or mislink**: value ranges, enum membership,
 *   identifier syntax, page numbering, timestamp form, uniqueness.
 * - They do not re-check **cosmetic normalisation**. Rust collapses whitespace in a
 *   label and normalises it to NFC. A hand-edit that leaves two spaces in a course name
 *   produces a file Rust would tidy but that renders perfectly, and refusing to open
 *   someone's lecture over it would be the wrong trade.
 *
 * Anything Rust accepts, these accept. The reverse does not hold, which is safe: Rust
 * remains the authority on writes, so a value this layer tolerated is still refused if
 * the UI ever tries to save it.
 */
import * as z from "zod";

/** Rust caps lengths in **bytes**; `String.length` counts UTF-16 units. */
const encoder = new TextEncoder();

const withinBytes = (limit: number) => (value: string) => encoder.encode(value).length <= limit;

/**
 * The tolerance `NormalizedRect` allows past the page edge.
 *
 * Must match `BOUNDS_TOLERANCE` in `normalized_rect.rs`. A rectangle that mathematically
 * ends at the page edge can arrive as `1.0000000000000002` after floating-point
 * transforms, and rejecting that would drop legitimate highlights of the last word on a
 * line.
 */
const BOUNDS_TOLERANCE = 1e-6;

/** `YYYY-MM-DDTHH:MM:SSZ`, the one form `Timestamp` writes. */
export const TimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "not a canonical UTC timestamp");

/** Human-readable text: a title, a course name, a tag. */
export const LabelSchema = z
  .string()
  .min(1, "a label cannot be empty")
  .refine(withinBytes(500), "longer than a label can hold");

/** Text quoted out of a document, or typed onto it. */
export const ExcerptSchema = z
  .string()
  .min(1, "an excerpt cannot be empty")
  .refine(withinBytes(4000), "longer than a highlight can hold");

/**
 * A fractional index: one letter declaring the integer part's length, then base-62
 * digits whose ASCII order matches their numeric order.
 */
export const OrderKeySchema = z
  .string()
  .regex(/^[a-zA-Z][0-9A-Za-z]*$/, "not a well-formed order key");

/**
 * An annotation's identity, as written into `notes.md` as `cite://<id>`.
 *
 * Restricted to characters that need no escaping in a URL, since that is literally where
 * it ends up. Any prefix is allowed and carries no meaning.
 */
export const AnnotationIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "not a usable annotation identifier");

/**
 * A fingerprint of a file's contents, as written into `manifest.json`.
 *
 * Exactly sixteen lowercase hex characters: FNV-1a 64-bit, formatted with leading zeros
 * so the same value is always the same string. Deliberately strict -- a loosely accepted
 * fingerprint could compare unequal to the same file's real one and prompt someone to
 * reconvert a document that never changed.
 *
 * Not cryptographic, and not for deciding whether to *trust* bytes. It answers "have
 * these bytes changed?" and nothing more. See `fingerprint.rs`.
 */
export const FingerprintSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/, "not a well-formed content fingerprint");

/** A page number, counting from 1 as a person reads it. */
export const PageNumberSchema = z.int().min(1, "documents are numbered from 1");

/** A path inside a bundle, always relative so moving the bundle needs no rewriting. */
export const RelativePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/"), "must be relative to the bundle")
  .refine(
    (value) => !value.split("/").includes(".."),
    "must not point outside the bundle",
  );

/**
 * A rectangle in page-relative coordinates.
 *
 * Fractions of the **unscaled** page, which is what makes a highlight land in the same
 * place on a laptop, a 4K display and an iPad.
 */
export const NormalizedRectSchema = z
  .strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine(
    (rect) => rect.x + rect.width <= 1 + BOUNDS_TOLERANCE,
    "extends past the right edge of the page",
  )
  .refine(
    (rect) => rect.y + rect.height <= 1 + BOUNDS_TOLERANCE,
    "extends past the bottom edge of the page",
  );

export type NormalizedRect = z.infer<typeof NormalizedRectSchema>;
