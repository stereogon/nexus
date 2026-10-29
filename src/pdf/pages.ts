/**
 * Where each page sits in the scroller, and which ones are worth rendering.
 *
 * Pure arithmetic over numbers, deliberately: this is the part of the viewer that can be
 * tested without a browser, and it is also the part most likely to be wrong by one. The
 * component above it does nothing but read these answers and draw.
 *
 * Indices are zero-based throughout. The toolbar's "4 / 18" adds the one, in the one place
 * a person sees a page number — mixing the two conventions inside the module would be a
 * standing invitation to an off-by-one.
 */

/** One page's place in the stack. */
export interface PageBox {
  /** Distance from the top of the scroller to the top of the page. */
  readonly top: number;
  /** The page's rendered height. */
  readonly height: number;
}

/** The pages to render, as an inclusive range of indices. */
export interface RenderWindow {
  readonly first: number;
  readonly last: number;
}

/**
 * How many pages either side of the visible ones to render anyway.
 *
 * `claude-spec.md` line 19 asks for "only visible pages + a 2-page buffer". The buffer is
 * what makes a flick scroll show a page rather than a blank, and keeping it small is the
 * point of virtualising at all.
 */
export const PAGE_BUFFER = 2;

/** Stacks pages vertically, `gap` apart, in order. */
export function stack(heights: readonly number[], gap: number): readonly PageBox[] {
  const boxes: PageBox[] = [];
  let top = 0;

  for (const height of heights) {
    boxes.push({ top, height });
    top += height + gap;
  }

  return boxes;
}

/**
 * The scroller's full height.
 *
 * The trailing gap is not included: it would be empty space under the last page that a
 * person can scroll into for no reason.
 */
export function totalHeight(boxes: readonly PageBox[]): number {
  const last = boxes.at(-1);

  return last === undefined ? 0 : last.top + last.height;
}

/**
 * How much of a page is inside the viewport.
 *
 * Zero when it is entirely outside, which is what makes [`currentIndex`] a comparison
 * rather than a series of cases.
 */
function visibleHeight(
  box: PageBox,
  scrollTop: number,
  viewportHeight: number,
): number {
  const top = Math.max(box.top, scrollTop);
  const bottom = Math.min(box.top + box.height, scrollTop + viewportHeight);

  return Math.max(0, bottom - top);
}

/**
 * The pages worth rendering at this scroll position.
 *
 * `null` when there are no pages, rather than an empty range: a range of zero length and
 * "nothing to draw" are different things, and returning `{first: 0, last: -1}` would make
 * every caller check the same subtraction.
 *
 * A negative `scrollTop` is clamped, because a trackpad rubber-band on macOS reports one
 * and the answer there is the first page, not an empty window.
 */
export function renderWindow(
  boxes: readonly PageBox[],
  scrollTop: number,
  viewportHeight: number,
  buffer: number = PAGE_BUFFER,
): RenderWindow | null {
  if (boxes.length === 0) {
    return null;
  }

  const from = Math.max(0, scrollTop);
  const to = from + Math.max(0, viewportHeight);

  let first: number | null = null;
  let last = 0;

  for (const [index, box] of boxes.entries()) {
    // Touching counts as visible: a page whose top edge is exactly at the fold is about to
    // be looked at.
    if (box.top <= to && box.top + box.height >= from) {
      first ??= index;
      last = index;
    }
  }

  // Scrolled past the end -- which happens while the page heights are still being measured
  // -- leaves nothing intersecting. The last page is the honest answer, not a blank.
  if (first === null) {
    const edge = boxes.length - 1;

    return {
      first: Math.max(0, edge - buffer),
      last: edge,
    };
  }

  return {
    first: Math.max(0, first - buffer),
    last: Math.min(boxes.length - 1, last + buffer),
  };
}

/**
 * The page the person is looking at, for the toolbar.
 *
 * The one showing most of itself, and the earlier page on a tie. Picking the page under
 * the top edge instead would flicker to the next page the moment a gap crossed the fold,
 * which is the behaviour every PDF reader gets wrong at some point.
 */
export function currentIndex(
  boxes: readonly PageBox[],
  scrollTop: number,
  viewportHeight: number,
): number {
  let best = 0;
  let mostVisible = -1;

  for (const [index, box] of boxes.entries()) {
    const visible = visibleHeight(box, Math.max(0, scrollTop), viewportHeight);

    if (visible > mostVisible) {
      best = index;
      mostVisible = visible;
    }
  }

  return best;
}

/**
 * The zoom that fits a page's width, given the space available.
 *
 * Clamped so a fit never becomes an absurd magnification of a tiny page, and never a
 * negative scale on a container that has not been laid out yet.
 */
export function fitWidth(
  pageWidth: number,
  available: number,
  limits: { readonly min: number; readonly max: number },
): number {
  if (pageWidth <= 0 || available <= 0) {
    return 1;
  }

  return Math.min(limits.max, Math.max(limits.min, available / pageWidth));
}
