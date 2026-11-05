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

/** The smallest a card is drawn, in CSS pixels: room for its buttons and three lines. */
export const STICKY_LEGIBLE = { width: 200, height: 112 } as const;

/**
 * The note as it is drawn on a page `page` pixels in size: at least `STICKY_LEGIBLE`, and
 * moved in from the edges as far as that takes to keep it wholly on the page.
 *
 * Added 2026-11-05. A note is stored as a fraction of its page, and on a wide, short slide
 * at a small zoom the default fraction came to about 130 × 45 pixels — the header and
 * barely a line — so its buttons and words were cut off. The floor is applied here rather
 * than as a CSS `min-width`, which was tried first and failed twice: a card drawn larger
 * than its region resized from the smaller stored size, so dragging the corner did nothing
 * visible at first; and nothing moved it in from the page's edge, so its ✕ was cut off at
 * the right margin. Drags and resizes start from this rectangle, so what is stored after a
 * gesture is what was on screen.
 */
export function legible(region: NormalizedRect, page: { readonly width: number; readonly height: number }): NormalizedRect {
  if (page.width <= 0 || page.height <= 0) {
    return region;
  }

  const width = Math.min(1, Math.max(region.width, STICKY_LEGIBLE.width / page.width));
  const height = Math.min(1, Math.max(region.height, STICKY_LEGIBLE.height / page.height));

  return {
    x: clamp(region.x, 0, 1 - width),
    y: clamp(region.y, 0, 1 - height),
    width,
    height,
  };
}
