/**
 * Turning what the cursor did into coordinates that can be stored.
 *
 * # The contract this file exists to keep
 *
 * §3: annotation geometry is normalised to `[0.0, 1.0]` against the **unscaled**
 * (`scale: 1`) page, accounting for rotation. Raw pixels never reach disk. Normalising
 * against the rendered page box satisfies that for free — the zoom divides out, so a
 * highlight made at 300% is the same numbers as the same highlight made at 50% — and
 * rotation is already in the box, because `getViewport` applies the page's `/Rotate`.
 *
 * That is also what makes these coordinates portable to the iPad, which will render the
 * same page at a different size and must land the highlight in the same place.
 *
 * # What Rust will refuse
 *
 * `NormalizedRect::new` rejects a component outside `[0.0, 1.0]`, a width or height that
 * is not strictly positive, and a rectangle that starts inside the page but extends past
 * its right or bottom edge. A zero-area rectangle is refused on purpose: it would persist
 * as an annotation nobody can see or click.
 *
 * So this module clamps and then **drops** what is left degenerate, rather than passing it
 * on to fail at the boundary. A selection that grazes the edge of a page is an ordinary
 * thing for a cursor to do, not an error worth showing anybody.
 */

/** A rectangle in page-relative fractions, matching Rust's `NormalizedRect`. */
export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A rectangle in layout pixels: a client rect, or a page's own box. */
export interface PixelRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The smallest fraction of a page an annotation may cover, per side.
 *
 * Rust rejects a zero-area rectangle, and floating point makes "zero" an unreliable thing
 * to test for: a sliver 1e-17 of a page wide is positive, would be stored, and could never
 * be seen or clicked. One part in a hundred thousand of a page is far below anything a
 * cursor can produce deliberately and far above rounding noise.
 */
const SMALLEST_SIDE = 1e-5;

/** Whether every component is a real, finite number. */
function finite(rect: PixelRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height)
  );
}

function clampToUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Converts one rectangle in page pixels to page fractions, or `null` if nothing usable
 * is left.
 *
 * `null` rather than a throw, and rather than a clamped sliver: a selection that reaches
 * past the edge of a page, or a client rect for a line break, is normal cursor behaviour.
 * The caller drops it and keeps the rest of the selection.
 */
export function normalise(box: PixelRect, page: PixelRect): NormalizedRect | null {
  if (!finite(box) || !finite(page) || page.width <= 0 || page.height <= 0) {
    return null;
  }

  // Clamped on each edge independently, so a rectangle hanging over the right margin keeps
  // the part of it that is on the page instead of being thrown away whole.
  const left = clampToUnit((box.left - page.left) / page.width);
  const top = clampToUnit((box.top - page.top) / page.height);
  const right = clampToUnit((box.left + box.width - page.left) / page.width);
  const bottom = clampToUnit((box.top + box.height - page.top) / page.height);

  const width = right - left;
  const height = bottom - top;

  if (width < SMALLEST_SIDE || height < SMALLEST_SIDE) {
    return null;
  }

  return { x: left, y: top, width, height };
}

/**
 * Converts page fractions back to pixels, for drawing.
 *
 * The inverse of [`normalise`] within floating-point tolerance, which the tests pin at the
 * four zoom levels the milestone names.
 */
export function denormalise(rect: NormalizedRect, page: PixelRect): PixelRect {
  return {
    left: page.left + rect.x * page.width,
    top: page.top + rect.y * page.height,
    width: rect.width * page.width,
    height: rect.height * page.height,
  };
}

/**
 * Whether two rectangles sit on the same line of text.
 *
 * Decided by how much they overlap vertically rather than by their tops matching, because
 * a line mixing font sizes — a superscript, an inline formula, a bold run — produces rects
 * of different heights and different tops that a reader sees as one line. Comparing tops
 * would split such a line in two and draw a highlight with a notch in it.
 */
function sameLine(a: PixelRect, b: PixelRect): boolean {
  const overlap =
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);

  return overlap > Math.min(a.height, b.height) / 2;
}

/** The smallest rectangle containing both. */
function merged(a: PixelRect, b: PixelRect): PixelRect {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);

  return {
    left,
    top,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  };
}

/**
 * Collapses the browser's client rects for a selection into one rectangle per line.
 *
 * A `Range` reports a rect per text fragment, so a sentence crossing three spans arrives as
 * three rects, and a nested span can report a rect that duplicates part of its parent's.
 * Drawing those directly gives a highlight with visible seams and double-darkened overlaps.
 * Rust's `TextHighlight` wants one rectangle per line, which is also what looks right.
 *
 * Rects arrive in document order for a forward selection and may not for a backwards one,
 * so they are sorted first and the output is top-to-bottom regardless of which way the
 * selection was dragged.
 */
export function lineRects(
  boxes: readonly PixelRect[],
  page: PixelRect,
): NormalizedRect[] {
  // Copied before sorting, not `toSorted`: that is ES2023 and arrived in Safari 16, and
  // this build targets Safari 15. The copy is also what keeps the caller's array -- the
  // browser's own rect list -- untouched.
  const usable = [...boxes]
    .filter((box) => finite(box) && box.width > 0 && box.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const lines: PixelRect[] = [];

  for (const box of usable) {
    const last = lines.at(-1);

    if (last !== undefined && sameLine(last, box)) {
      lines[lines.length - 1] = merged(last, box);
    } else {
      lines.push(box);
    }
  }

  return lines
    .map((line) => normalise(line, page))
    .filter((rect): rect is NormalizedRect => rect !== null);
}

/** The smallest rectangle containing all of them, or `null` for none. */
export function bounding(rects: readonly NormalizedRect[]): NormalizedRect | null {
  const first = rects[0];

  if (first === undefined) {
    return null;
  }

  let left = first.x;
  let top = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;

  for (const rect of rects.slice(1)) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}
