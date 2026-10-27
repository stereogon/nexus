/**
 * Zod schema for `annotations.json`.
 *
 * Mirrors the tagged enum in `annotation.rs`: `kind` is the discriminant and each kind
 * carries exactly its own fields, so a record claiming `textHighlight` while holding a
 * text box's `text` is rejected rather than half-understood.
 *
 * Objects are strict, matching `deny_unknown_fields` on the Rust side. An unexpected key
 * means this build does not understand the file, and understanding it partially is worse
 * than saying so.
 */
import * as z from "zod";

import type { NormalizedRect } from "./primitives.js";
import {
  AnnotationIdSchema,
  ExcerptSchema,
  NormalizedRectSchema,
  PageNumberSchema,
  TimestampSchema,
} from "./primitives.js";

/** The version of `annotations.json` this build reads and writes. */
export const ANNOTATIONS_SCHEMA_VERSION = 1;

/**
 * What a highlight marks.
 *
 * The meaning is stored, never the colour: colour is a design token, and deriving the
 * required K/D/E/Q glyph from a hex value is impossible. See `highlight_semantic.rs`.
 */
export const HighlightSemanticSchema = z.enum([
  "key",
  "definition",
  "exam",
  "question",
]);

export type HighlightSemantic = z.infer<typeof HighlightSemanticSchema>;

/** The letter drawn on a highlight so the four do not rely on hue alone. */
export const semanticGlyph: Record<HighlightSemantic, string> = {
  key: "K",
  definition: "D",
  exam: "E",
  question: "Q",
};

const timestamps = {
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

const TextHighlightSchema = z.strictObject({
  kind: z.literal("textHighlight"),
  id: AnnotationIdSchema,
  page: PageNumberSchema,
  semantic: HighlightSemanticSchema,
  quote: ExcerptSchema,
  // Never empty: a text highlight covering no part of the page could not be drawn, nor
  // linked to from the notes.
  //
  // A variadic tuple rather than `z.array(...).min(1)` or `.nonempty()`, both of which
  // check at runtime but still infer `Rect[]`. This infers `[Rect, ...Rect[]]`, so the
  // *type* carries the guarantee -- which is what lets `boundingRect` fold without a
  // seed value and without the non-null assertion that section 4 bans.
  rects: z.tuple([NormalizedRectSchema], NormalizedRectSchema),
  ...timestamps,
});

const AreaHighlightSchema = z.strictObject({
  kind: z.literal("areaHighlight"),
  id: AnnotationIdSchema,
  page: PageNumberSchema,
  semantic: HighlightSemanticSchema,
  region: NormalizedRectSchema,
  // A diagram has no text to quote, so this is genuinely optional and omitted when absent
  // rather than written as null.
  caption: ExcerptSchema.optional(),
  ...timestamps,
});

const TextBoxSchema = z.strictObject({
  kind: z.literal("textBox"),
  id: AnnotationIdSchema,
  page: PageNumberSchema,
  region: NormalizedRectSchema,
  text: ExcerptSchema,
  ...timestamps,
});

export const AnnotationSchema = z
  .discriminatedUnion("kind", [
    TextHighlightSchema,
    AreaHighlightSchema,
    TextBoxSchema,
  ])
  .refine(
    (annotation) => annotation.createdAt <= annotation.updatedAt,
    "changed before it was made",
  );

export type Annotation = z.infer<typeof AnnotationSchema>;

export const AnnotationSetSchema = z
  .strictObject({
    schemaVersion: z.literal(ANNOTATIONS_SCHEMA_VERSION),
    annotations: z.array(AnnotationSchema),
  })
  .refine(
    ({ annotations }) =>
      new Set(annotations.map((a) => a.id)).size === annotations.length,
    // Two annotations with one id would mean a cite:// link in the notes resolving to
    // both, with nothing to say which was meant.
    "two annotations share an identifier",
  );

export type AnnotationSet = z.infer<typeof AnnotationSetSchema>;

/** The box a deep link centres on: derived, never stored. */
export function boundingRect(annotation: Annotation): NormalizedRect {
  if (annotation.kind === "textHighlight") {
    return annotation.rects.reduce((box, rect) => {
      const left = Math.min(box.x, rect.x);
      const top = Math.min(box.y, rect.y);
      const right = Math.max(box.x + box.width, rect.x + rect.width);
      const bottom = Math.max(box.y + box.height, rect.y + rect.height);
      return { x: left, y: top, width: right - left, height: bottom - top };
    });
  }

  return annotation.region;
}

/** The text an annotation carries, if any. Lets search ignore which kind it found. */
export function annotationText(annotation: Annotation): string | undefined {
  switch (annotation.kind) {
    case "textHighlight":
      return annotation.quote;
    case "areaHighlight":
      return annotation.caption;
    case "textBox":
      return annotation.text;
  }
}
