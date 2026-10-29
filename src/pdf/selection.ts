/**
 * Turning a text selection into something that can be stored as a highlight.
 *
 * # Where the work actually happens
 *
 * Almost none of it is here. `geometry.ts` already collapses the browser's client rects
 * into one rectangle per line and normalises them against the unscaled page, which is the
 * part that has to be right. This module's job is narrower and entirely about the DOM:
 * which page was selected, which of the browser's rects belong to it, and what was said.
 *
 * It is split into one glue function and three that are pure, because the glue needs a
 * real layout engine and the rest do not. jsdom reports every rectangle as zero, so a test
 * there can check which page was found and which rects were kept, but never where a
 * highlight lands. That needs a browser, and until the Playwright suite exists it is
 * unverified — said plainly rather than implied by a passing test.
 */
import { lineRects, type NormalizedRect, type PixelRect } from "./geometry";

/** The attribute a page element carries so a selection can say which page it is on. */
export const PAGE_INDEX_ATTRIBUTE = "data-page";

/** A highlight the window could store, if someone picks a semantic for it. */
export interface HighlightCandidate {
  /** The page it sits on, counting from 0 — the window's convention, not the file's. */
  readonly pageIndex: number;
  /** One rectangle per line, normalised against the unscaled page. */
  readonly rects: readonly NormalizedRect[];
  /** The text covered, trimmed. */
  readonly quote: string;
}

/**
 * The page a node sits on, or `null` if it is not on one.
 *
 * A selection's start is usually a text node, which has no `closest`, so this climbs to an
 * element first. Returning `null` rather than guessing matters: a selection in the sidebar
 * or the toolbar is an ordinary thing to do and must not produce a highlight on page 1.
 */
export function pageIndexOf(node: Node | null): number | null {
  const element = pageAround(node);

  if (element === null) {
    return null;
  }

  const written = element.getAttribute(PAGE_INDEX_ATTRIBUTE);

  // The empty string is checked before converting, because `Number("")` is `0` -- an
  // attribute present but blank would otherwise read as a perfectly good page 1.
  if (written === null || written.trim() === "") {
    return null;
  }

  const read = Number(written);

  // A page index has to be a whole number that is not negative. Anything else means the
  // attribute was written wrongly, and a highlight stored against it would be unfindable.
  return Number.isInteger(read) && read >= 0 ? read : null;
}

/**
 * The rectangles that belong to one page.
 *
 * A selection dragged past the bottom of a page carries on into the next one, and the
 * browser reports rects for both. Normalising those against the first page's box would
 * place them somewhere plausible and wrong, because `normalise` clamps to the page rather
 * than rejecting what is outside it.
 *
 * Judged on each rectangle's vertical centre rather than on containment, so a line
 * straddling the boundary by a pixel is kept with the page it mostly sits on instead of
 * being dropped from both.
 */
export function withinPage(
  boxes: readonly PixelRect[],
  page: PixelRect,
): readonly PixelRect[] {
  const top = page.top;
  const bottom = page.top + page.height;

  return boxes.filter((box) => {
    const centre = box.top + box.height / 2;

    return centre >= top && centre <= bottom;
  });
}

/**
 * Assembles a candidate, or `null` if nothing storable is left.
 *
 * Separate from the DOM reading below so the rules can be tested without a layout engine.
 * Every `null` here is a selection that exists but cannot become a highlight: no text, or
 * no rectangle that survived normalising.
 */
export function candidateIn(
  pageIndex: number,
  boxes: readonly PixelRect[],
  page: PixelRect,
  quote: string,
): HighlightCandidate | null {
  const said = quote.trim();

  if (said === "") {
    return null;
  }

  const rects = lineRects(withinPage(boxes, page), page);

  // Rust refuses a text highlight covering no rectangle, since it could neither be drawn
  // nor linked to. Refusing it here too means the window never offers a menu for a
  // highlight that would be rejected the moment someone chose from it.
  return rects.length === 0 ? null : { pageIndex, rects, quote: said };
}

/**
 * The nearest element to a node: itself, or its parent if it is a text node.
 *
 * `closest` lives on `Element`, and a selection's boundary is usually a `Text`. Narrowed
 * with `instanceof` rather than cast, so this stays honest about what it was handed.
 */
function elementOf(node: Node | null): Element | null {
  if (node === null) {
    return null;
  }

  return node instanceof Element ? node : node.parentElement;
}

/** The page element a node sits inside, or `null` if it is not on a page. */
function pageAround(node: Node | null): Element | null {
  return elementOf(node)?.closest(`[${PAGE_INDEX_ATTRIBUTE}]`) ?? null;
}

/** A `DOMRect` as the plain shape `geometry` works in. */
function asPixelRect(rect: DOMRect): PixelRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * What the current selection could become, or `null` if it could become nothing.
 *
 * The page is taken from where the selection **started**, so a drag running onto the next
 * page highlights the part on the page it began on rather than silently moving.
 */
export function candidateFrom(selection: Selection | null): HighlightCandidate | null {
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const pageIndex = pageIndexOf(range.startContainer);
  const page = pageAround(range.startContainer);

  if (pageIndex === null || page === null) {
    return null;
  }

  // Both in viewport coordinates, which is what `normalise` subtracts one from the other
  // expects. Taking them in either order from a different origin is how a highlight ends
  // up offset by however far the page has been scrolled.
  const boxes = [...range.getClientRects()].map(asPixelRect);

  return candidateIn(
    pageIndex,
    boxes,
    asPixelRect(page.getBoundingClientRect()),
    selection.toString(),
  );
}
