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
import { MIN_LINE_HEIGHT } from "../pdf/geometry";

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
 * `null` when nothing is left to place it on — no rectangles, which Rust refuses to store
 * anyway, or none with a line's worth of height. Returned rather than assumed, so this
 * stays total and the caller does not have to index into an empty list.
 */
export function badgeAt(
  rects: readonly NormalizedRect[],
  page: { readonly width: number; readonly height: number },
  size: number = BADGE_SIZE,
): BadgeAt | null {
  if (page.width <= 0 || page.height <= 0) {
    return null;
  }

  // The last rectangle tall enough to be a line, rather than simply the last. Highlights
  // stored before 2026-10-29 carry a sliver of the pdf.js text layer's foot as their final
  // rectangle, and placing the badge from it puts the glyph in the page's bottom-right
  // corner. `lineRects` no longer produces one, but a file already on disk is a contract
  // (§1.8) and re-reading it must not go on showing the bug.
  //
  // Judged in page pixels against `MIN_LINE_HEIGHT`, the same threshold and the same unit
  // `lineRects` uses, so the two cannot drift into disagreeing about what a line is. A
  // plain loop rather than `findLast`, which is ES2023 and arrived in Safari 16; this
  // build targets Safari 15, as the note beside `toSorted` in `geometry` records.
  let last: NormalizedRect | undefined;

  for (const rect of rects) {
    if (rect.width * page.width > 0 && rect.height * page.height >= MIN_LINE_HEIGHT) {
      last = rect;
    }
  }

  if (last === undefined) {
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
