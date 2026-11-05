/**
 * Finding words in a PDF's pages: where each match is, and moving between them.
 *
 * Offsets count UTF-16 units in a page's text as `RenderablePage.text` joins it, which is
 * the same string the text layer's spans hold — so a match found here can be marked there.
 * Matching ignores case. It does not fold accents, and it does not cross a line break the
 * PDF stores as two runs ("lea-" / "der"), which pdf.js's own viewer handles with a
 * normalisation step this does not have.
 */

export interface FindMatch {
  /** Counting from zero. */
  readonly pageIndex: number;
  readonly start: number;
  readonly length: number;
}

/**
 * The text lowercased, with each lowercased unit's position in the original. Lowercasing
 * can change a string's length (`İ` becomes two units), so positions in the two differ.
 */
function folded(text: string): { readonly text: string; readonly origin: readonly number[] } {
  let out = "";
  const origin: number[] = [];

  for (let at = 0; at < text.length; ) {
    const point = text.codePointAt(at) ?? 0;
    const character = String.fromCodePoint(point);
    const lower = character.toLowerCase();

    out += lower;

    for (let unit = 0; unit < lower.length; unit += 1) {
      origin.push(at);
    }

    at += character.length;
  }

  origin.push(text.length);

  return { text: out, origin };
}

/** Every match of `query` on one page, in order, not overlapping. */
export function findOnPage(text: string, query: string, pageIndex: number): readonly FindMatch[] {
  const wanted = query.trim().toLowerCase();

  if (wanted === "") {
    return [];
  }

  const page = folded(text);
  const found: FindMatch[] = [];

  for (let at = page.text.indexOf(wanted); at !== -1; at = page.text.indexOf(wanted, at + wanted.length)) {
    const start = page.origin[at] ?? 0;
    const end = page.origin[at + wanted.length] ?? text.length;

    found.push({ pageIndex, start, length: end - start });
  }

  return found;
}

/** The match to start on: the first on or after the page being read, else the first. */
export function startingMatch(matches: readonly FindMatch[], showing: number): number | null {
  if (matches.length === 0) {
    return null;
  }

  const here = matches.findIndex((match) => match.pageIndex >= showing);

  return here === -1 ? 0 : here;
}

/** The next or previous match, wrapping round at either end. */
export function steppedMatch(current: number | null, count: number, direction: 1 | -1): number | null {
  if (count === 0) {
    return null;
  }

  if (current === null) {
    return direction === 1 ? 0 : count - 1;
  }

  return (current + direction + count) % count;
}

/** One match on a drawn page, and whether it is the current one. */
export interface PageMatch {
  readonly start: number;
  readonly length: number;
  readonly current: boolean;
}

/** No matches on a page; one shared array, so a page without any is not redrawn. */
export const NO_MATCHES: readonly PageMatch[] = [];

/** The matches grouped by page, the current one flagged. */
export function matchesByPage(matches: readonly FindMatch[], current: number | null): ReadonlyMap<number, readonly PageMatch[]> {
  const byPage = new Map<number, PageMatch[]>();

  matches.forEach((match, at) => {
    const page = byPage.get(match.pageIndex) ?? [];

    page.push({ start: match.start, length: match.length, current: at === current });
    byPage.set(match.pageIndex, page);
  });

  return byPage;
}

/** A mark's box, in CSS pixels from the text layer's top-left. */
export interface MarkBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly current: boolean;
}

/**
 * The DOM range covering `length` units from `start` of the text under `root`, or `null`
 * if the text is shorter than that — a layer still being drawn.
 */
export function textRange(root: Node, start: number, length: number): Range | null {
  const walker = root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = root.ownerDocument?.createRange();

  if (walker === undefined || range === undefined) {
    return null;
  }

  const end = start + length;
  let passed = 0;
  let begun = false;

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const size = node.textContent?.length ?? 0;

    if (!begun && start < passed + size) {
      range.setStart(node, start - passed);
      begun = true;
    }

    if (begun && end <= passed + size) {
      range.setEnd(node, end - passed);
      return range;
    }

    passed += size;
  }

  return null;
}

/** Where to draw each match over a drawn text layer. */
export function markBoxes(layer: HTMLElement, matches: readonly PageMatch[]): readonly MarkBox[] {
  const origin = layer.getBoundingClientRect();

  return matches.flatMap((match) =>
    [...(textRange(layer, match.start, match.length)?.getClientRects() ?? [])].map((rect) => ({
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      width: rect.width,
      height: rect.height,
      current: match.current,
    })),
  );
}
