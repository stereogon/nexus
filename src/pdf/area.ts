/**
 * Turning an Option-drag into the region an area highlight covers.
 *
 * Pure, and apart from the component that listens for the mouse, for the reason
 * `selection.ts` is: the rules are what has to be right, and a rule tested without a
 * layout engine is a rule that can be tested at all. Where the box lands on a real page
 * is the Playwright journey's job.
 *
 * Normalised through `geometry.normalise`, the same function a text selection goes
 * through, so an area and a highlight cannot disagree about what "the page" means — §3's
 * unscaled-page rule is written once.
 */
import { normalise, type NormalizedRect, type PixelRect } from "./geometry";

/** A point in viewport pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The smallest box worth keeping, per side, in CSS pixels.
 *
 * An Option-click with a wobble is not a request to highlight a three-pixel square. Below
 * this the drag is treated as no drag at all, which is also what makes a stray Option-click
 * harmless.
 */
export const MIN_AREA_SIDE = 8;

/** The box between where a drag started and where it is now, in either direction. */
export function boxBetween(start: Point, end: Point): PixelRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/**
 * The region a drawn box covers on its page, or `null` if it is too small to mean one.
 *
 * A box dragged off the edge of the page keeps the part that is on it — `normalise`
 * clamps each edge — because dragging slightly past a diagram in the corner of a slide is
 * ordinary, and refusing it would make corners the hardest place to mark.
 */
export function areaIn(box: PixelRect, page: PixelRect): NormalizedRect | null {
  if (box.width < MIN_AREA_SIDE || box.height < MIN_AREA_SIDE) {
    return null;
  }

  return normalise(box, page);
}
