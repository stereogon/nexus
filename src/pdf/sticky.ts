/**
 * Where a sticky note goes, and how dragging and resizing keep it on its page.
 *
 * All in page fractions, like every other position in a bundle (§3), so a note stays
 * beside its highlight at any zoom and on any screen. Pure, so the edge cases — a
 * highlight at the right margin, a drag past the page — are written down rather than
 * arranged by hand.
 */
import type { NormalizedRect } from "./geometry";

/** A new note's size, as a fraction of the page: a small card on a slide. */
export const STICKY_SIZE = { width: 0.24, height: 0.16 } as const;

/** The smallest a note may be resized to, so it can always be grabbed and read. */
export const STICKY_MIN = { width: 0.1, height: 0.07 } as const;

/** The default room between a highlight and its note, as a fraction of the page. */
const GAP = 0.015;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * A note's place beside a highlight: to its right, else to its left, else below it — the
 * first that fits on the page — at the highlight's own height.
 *
 * `gap` is the room left after the highlight. The caller passes enough for the highlight's
 * badge and its notes indicator, which sit just past its end: a note placed closer covered
 * the badge, and with it the only way to the highlight's menu (found by the journey that
 * removes a highlight after giving it a note, 2026-11-05).
 */
export function stickyBeside(highlight: NormalizedRect, size = STICKY_SIZE, gap = GAP): NormalizedRect {
  const right = highlight.x + highlight.width + gap;
  const left = highlight.x - GAP - size.width;
  const top = clamp(highlight.y, 0, 1 - size.height);

  if (right + size.width <= 1) {
    return { x: right, y: top, ...size };
  }

  if (left >= 0) {
    return { x: left, y: top, ...size };
  }

  return {
    x: clamp(highlight.x, 0, 1 - size.width),
    y: clamp(highlight.y + highlight.height + GAP, 0, 1 - size.height),
    ...size,
  };
}

/** The note moved by `dx`, `dy`, kept wholly on the page. */
export function movedBy(region: NormalizedRect, dx: number, dy: number): NormalizedRect {
  return {
    ...region,
    x: clamp(region.x + dx, 0, 1 - region.width),
    y: clamp(region.y + dy, 0, 1 - region.height),
  };
}

/** The note resized by `dw`, `dh` from its corner, no smaller than `STICKY_MIN`, on the page. */
export function resizedBy(region: NormalizedRect, dw: number, dh: number): NormalizedRect {
  return {
    ...region,
    width: clamp(region.width + dw, STICKY_MIN.width, 1 - region.x),
    height: clamp(region.height + dh, STICKY_MIN.height, 1 - region.y),
  };
}
