/**
 * Turning a scroll offset into a place in the document and back: a page, and how far down
 * it. Normalised to the page, as annotations are, so a place restored at another zoom or
 * window size lands on the same words.
 */
import type { PageBox } from "./pages";
import type { Position } from "../ipc/position";

/** The place at the top of the viewport, scrolled `scrollTop` down a stack of `boxes`. */
export function positionAt(boxes: readonly PageBox[], scrollTop: number): Position | null {
  // The page whose box holds the top of the viewport; in a gap, the next page down.
  const index = boxes.findIndex((box) => scrollTop < box.top + box.height);
  const box = boxes[index] ?? boxes.at(-1);

  if (box === undefined) {
    return null;
  }

  const at = index === -1 ? boxes.length - 1 : index;
  const offset = Math.min(Math.max((scrollTop - box.top) / box.height, 0), 0.999);

  return { page: at + 1, offset: Math.round(offset * 1000) / 1000 };
}

/** The scroll offset that puts `position` at the top of the viewport, or `null`. */
export function scrollFor(boxes: readonly PageBox[], position: Position): number | null {
  const box = boxes[position.page - 1];

  return box === undefined ? null : box.top + position.offset * box.height;
}
