/**
 * The highlights on a lecture: reading them, adding one, removing one.
 *
 * Everything here crosses from Rust, so everything here is parsed before use (§4). The
 * payload is a person's own work, so the cost of getting it wrong is not a blank pane but
 * a highlight drawn in the wrong place or silently lost.
 *
 * # Why the schema mirrors a tagged union rather than one wide object
 *
 * `Annotation` in `lecture-core` is a tagged enum: a text highlight carries `rects`, an
 * area highlight carries a `region`, a text box carries `text`. A single object with every
 * field optional would type-check against a file claiming `kind: "textHighlight"` with no
 * rectangles at all, which is exactly the contradiction the Rust side was shaped to make
 * undescribable. A discriminated union keeps that property on this side too.
 *
 * The bytes this must accept are pinned in `fixtures/annotations.json`, written by the Rust
 * tests and parsed by `annotations.test.ts`.
 */
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

/**
 * Slack allowed when checking a coordinate fits the page, mirroring Rust's
 * `BOUNDS_TOLERANCE`.
 *
 * A selection rectangle is the product of several floating-point transforms, so one that
 * mathematically ends at the page edge can arrive as `1.0000000000000002`. Rejecting that
 * would drop a legitimate highlight of the last word on a line.
 */
const BOUNDS_TOLERANCE = 1e-6;

/** A coordinate or extent as a fraction of the unscaled page. */
const Fraction = z.number().min(-BOUNDS_TOLERANCE).max(1 + BOUNDS_TOLERANCE);

/**
 * A rectangle in page-relative fractions, matching Rust's `NormalizedRect`.
 *
 * Each component is bounded, which is what keeps a corrupt file from producing a CSS
 * percentage big enough to lay out the page wrongly. **Containment is not re-checked
 * here** — that `x + width` fits within the page is Rust's invariant, enforced on the way
 * in and on the way off disk, and a second copy of the rule in a different floating-point
 * implementation is a second thing to disagree. The overlay clips to the page regardless.
 */
export const NormalizedRectSchema = z.object({
  x: Fraction,
  y: Fraction,
  width: Fraction,
  height: Fraction,
});

/**
 * What a highlight means.
 *
 * Four values, matching `HighlightSemantic`. An unknown one is a mismatch between the two
 * sides rather than something to draw, so the enum refuses it instead of falling back: a
 * semantic silently read as "key" would mislabel someone's exam material.
 */
export const HighlightSemanticSchema = z.enum([
  "key",
  "definition",
  "exam",
  "question",
]);

/** Fields every kind carries. */
const common = {
  id: z.string().min(1),
  page: z.number().int().positive(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
};

/** Something a person marked on a page. */
export const AnnotationSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("textHighlight"),
    semantic: HighlightSemanticSchema,
    quote: z.string(),
    // Never empty: Rust refuses a text highlight covering no part of the page, since it
    // could neither be drawn nor linked to.
    rects: z.array(NormalizedRectSchema).min(1),
  }),
  z.object({
    ...common,
    kind: z.literal("areaHighlight"),
    semantic: HighlightSemanticSchema,
    region: NormalizedRectSchema,
    // Absent rather than null when there is none: Rust skips the field entirely.
    caption: z.string().optional(),
  }),
  z.object({
    ...common,
    kind: z.literal("textBox"),
    region: NormalizedRectSchema,
    text: z.string(),
  }),
]);

export type NormalizedRect = z.infer<typeof NormalizedRectSchema>;
export type HighlightSemantic = z.infer<typeof HighlightSemanticSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;

/** A highlight the window is asking to store. */
export interface NewHighlight {
  /** The page it sits on, counting from 1. */
  readonly page: number;
  /** What the highlight marks. */
  readonly semantic: HighlightSemantic;
  /** The text covered, so a citation can show it without reopening the PDF. */
  readonly quote: string;
  /** One rectangle per line of selected text. */
  readonly rects: readonly NormalizedRect[];
}

/**
 * Every annotation on a lecture.
 *
 * A lecture nobody has highlighted yet has no annotations file, and that is not a failure:
 * it comes back as an empty list.
 *
 * @throws {CommandError} if the vault or the lecture cannot be read.
 */
export async function loadAnnotations(
  vault: string,
  directory: string,
): Promise<Annotation[]> {
  const payload: unknown = await invoke("load_annotations", { vault, directory });

  return z.array(AnnotationSchema).parse(payload);
}

/**
 * Stores a highlight over selected text, returning it as saved.
 *
 * The annotation comes back from Rust rather than being assembled here, because Rust is
 * what minted the id and stamped the time. Building a local copy to show immediately would
 * mean two versions of one record, and the optimistic one would be the one with the wrong
 * id in it.
 *
 * @throws {CommandError} if the lecture cannot be read, if the page or a rectangle is
 * unusable, or if the write fails — in which case the previous file is left as it was.
 */
export async function addHighlight(
  vault: string,
  directory: string,
  highlight: NewHighlight,
): Promise<Annotation> {
  const payload: unknown = await invoke("add_highlight", {
    vault,
    directory,
    highlight,
  });

  return AnnotationSchema.parse(payload);
}

/**
 * Removes one annotation, returning what was removed, or `null` if it was already gone.
 *
 * Removing something absent is not an error: the outcome asked for is that it is absent.
 *
 * @throws {CommandError} if the lecture cannot be read, if the id is not a usable one, or
 * if the write fails.
 */
export async function removeAnnotation(
  vault: string,
  directory: string,
  id: string,
): Promise<Annotation | null> {
  const payload: unknown = await invoke("remove_annotation", {
    vault,
    directory,
    id,
  });

  return AnnotationSchema.nullable().parse(payload);
}
