/**
 * What the four highlight semantics are called and which letter they carry.
 *
 * Mirrors `HighlightSemantic::describe` and `::glyph` in `lecture-core`. The *meaning* is
 * stored, never the colour — §3 and the domain both say so, and the reasons are worth
 * repeating here because this is the file that would tempt someone to store a hex: a
 * stored colour cannot be filtered as "exam material", it freezes the palette against
 * every highlight already saved, and the glyph cannot be derived from it.
 *
 * The glyph is **not decoration.** §3 requires it so the four can be told apart without
 * relying on hue, which is what makes the set usable for someone who cannot distinguish
 * the reds from the greens.
 */
import { HighlightSemanticSchema, type HighlightSemantic } from "../ipc/annotations";

/**
 * Every semantic, in palette order.
 *
 * Taken from the Zod enum rather than written out again, so the menu cannot fall behind
 * the schema — and the schema is pinned against Rust's own bytes by the contract test. A
 * fifth semantic added in the domain therefore reaches the menu by itself.
 */
export const SEMANTICS: readonly HighlightSemantic[] = HighlightSemanticSchema.options;

/** A short name, for the menu and for assistive technology. */
export const SEMANTIC_LABEL: Record<HighlightSemantic, string> = {
  key: "Key concept",
  definition: "Definition",
  exam: "Exam / important",
  question: "Question",
};

/** The letter drawn on the highlight. */
export const SEMANTIC_GLYPH: Record<HighlightSemantic, string> = {
  key: "K",
  definition: "D",
  exam: "E",
  question: "Q",
};
