/**
 * Keeping a floating menu inside the window.
 *
 * Reported on 2026-10-29: a highlight near the right margin opened its menu off the edge
 * of the screen, so Remove could not be reached. The menu was positioned from the
 * selection's own left edge, which is right until the selection is wide or near the
 * margin — and a highlight at the right margin is exactly where the menu needs to move.
 *
 * Pure, and taking the viewport as an argument rather than reading `window`, because the
 * interesting cases are all at edges that are tedious to arrange in a browser and trivial
 * to write down: a menu wider than the window, a selection on the last line, a selection
 * flush against the right margin.
 */

/** Where a menu would like to be, and what it is anchored to. */
export interface MenuAt {
  /** The anchor's left edge. */
  readonly left: number;
  /** Below the anchor: where the menu goes when there is room. */
  readonly top: number;
  /** The anchor's top edge, used to flip the menu above when there is not. */
  readonly above: number;
}

/** A box's size in pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** How close to the window edge a menu may sit. */
const MARGIN = 8;

/**
 * Places the menu so all of it is visible, preferring where it asked to go.
 *
 * Horizontally it slides left until it fits. Vertically it flips to sit **above** the
 * anchor rather than sliding, because sliding up would park it over the very text it
 * belongs to — the one place it must not be.
 *
 * When the menu is larger than the window it is pinned to the top-left margin instead of
 * being given a negative position. That cannot happen with four swatches on any real
 * display, but "cannot happen" is how a menu ends up unreachable on the one screen nobody
 * tried.
 */
export function placeMenu(
  at: MenuAt,
  size: Size,
  viewport: Size,
  margin: number = MARGIN,
): { readonly left: number; readonly top: number } {
  const rightmost = viewport.width - size.width - margin;
  const lowest = viewport.height - size.height - margin;

  // Flipped above only when there is actually room up there. A selection on the first
  // line of a document has no room either way, and covering the text below it is better
  // than being cut off by the top of the window.
  const flipped = at.above - size.height;
  const preferred = at.top > lowest && flipped >= margin ? flipped : at.top;

  return {
    left: Math.max(margin, Math.min(at.left, rightmost)),
    // Clamped after the flip, not instead of it. Flipping alone is not enough: an anchor
    // that is itself off the bottom -- a stale position, a menu left open across a jump --
    // flips to somewhere equally off the bottom, and the menu is just as unreachable.
    top: Math.max(margin, Math.min(preferred, lowest)),
  };
}
