import { describe, expect, it } from "vitest";

import { positionAt, scrollFor } from "./position";

// Three 400px pages with 16px gaps.
const BOXES = [
  { top: 0, height: 400 },
  { top: 416, height: 400 },
  { top: 832, height: 400 },
];

describe("a place in the document", () => {
  it("is the page at the top of the viewport and how far down it", () => {
    expect(positionAt(BOXES, 516)).toEqual({ page: 2, offset: 0.25 });
  });

  it("is the top of the next page when the viewport starts in a gap", () => {
    expect(positionAt(BOXES, 405)).toEqual({ page: 2, offset: 0 });
  });

  it("is the last page when scrolled past the end", () => {
    expect(positionAt(BOXES, 5000)?.page).toBe(3);
  });

  it("is nothing before the pages are measured", () => {
    expect(positionAt([], 0)).toBeNull();
  });

  it("comes back to the same scroll offset", () => {
    const place = positionAt(BOXES, 932);

    expect(place === null ? null : scrollFor(BOXES, place)).toBe(932);
  });

  it("lands on the same words at another zoom", () => {
    // The same quarter of page 2, with pages drawn twice as tall.
    const bigger = BOXES.map((box) => ({ top: box.top * 2, height: box.height * 2 }));

    expect(scrollFor(bigger, { page: 2, offset: 0.25 })).toBe(832 + 200);
  });

  it("cannot be restored on a page the document does not have", () => {
    expect(scrollFor(BOXES, { page: 9, offset: 0 })).toBeNull();
  });
});
