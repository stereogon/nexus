/**
 * Where the letter glyph sits on a highlight.
 *
 * Its own module because it is arithmetic with an edge case, and arithmetic with an edge
 * case is worth testing away from anything that has to be rendered.
 *
 * # Why it goes after the text rather than before it
 *
 * The glyph has to be legible and must not cover a word. Putting it in front of the first
 * line means either hanging it in the margin — which falls off the page for a highlight
 * starting at the left edge — or overlapping the first characters. Trailing whitespace at
 * the end of the last line is almost always free, and when it is not, the badge clamps to
 * the page edge instead of disappearing.
 */
import type { NormalizedRect } from "../ipc/annotations";

/** The badge's size in page pixels. Matches `--highlight-badge` in `highlights.css`. */
export const BADGE_SIZE = 14;

/** A position in page pixels, or `null` when there is nothing to put a badge on. */
export interface BadgeAt {
  readonly left: number;
  readonly top: number;
}

/**
 * Places the badge just past the end of the last line, kept on the page.
 *
 * `null` for no rectangles, which Rust refuses to store anyway — returned rather than
 * assumed, so this stays total and the caller does not have to index into an empty list.
 */
export function badgeAt(
  rects: readonly NormalizedRect[],
  page: { readonly width: number; readonly height: number },
  size: number = BADGE_SIZE,
): BadgeAt | null {
  const last = rects.at(-1);

  if (last === undefined || page.width <= 0 || page.height <= 0) {
    return null;
  }

  const right = (last.x + last.width) * page.width;
  const top = last.y * page.height;

  return {
    // Clamped at both ends: a highlight running to the right edge keeps its badge on the
    // page, and a page narrower than the badge still yields a position rather than a
    // negative one.
    left: Math.max(0, Math.min(right + 2, page.width - size)),
    top: Math.max(0, Math.min(top, page.height - size)),
  };
}
