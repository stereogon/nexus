/**
 * The pure rules about a lecture's list of annotations: turning a selection into a
 * request, one page's share of the list, and the list after a change.
 *
 * Moved out of `useAnnotations` on 2026-11-05, when the hook passed 300 lines; they never
 * needed React, and their tests never did either.
 */
import type { Annotation, HighlightSemantic, NewHighlight } from "../ipc/annotations";
import type { HighlightCandidate } from "../pdf/selection";

/**
 * Turns a candidate into the request Rust expects.
 *
 * The one thing it does is the page conversion, and it is the reason this is a named
 * function rather than an object literal inside a callback: the window counts pages from
 * zero and the file counts from one. An off-by-one here stores every highlight on the
 * wrong page, which is invisible until someone reopens the lecture.
 */
export function asNewHighlight(
  candidate: HighlightCandidate,
  semantic: HighlightSemantic,
): NewHighlight {
  return {
    page: candidate.pageIndex + 1,
    semantic,
    quote: candidate.quote,
    rects: candidate.rects,
  };
}

/** The highlights on one page, counting pages from zero. */
export function onPage(
  annotations: readonly Annotation[],
  pageIndex: number,
): readonly Annotation[] {
  return annotations.filter((annotation) => annotation.page === pageIndex + 1);
}

/**
 * The list after one annotation changed: the stored version in place of the old one,
 * appended if it is new, or gone for `null`.
 *
 * `null` from the backend means the lecture no longer has that annotation, so the window
 * stops drawing it. Keeping it would leave a highlight on screen that the file does not
 * hold, and the next click on its badge would be answered "not there" again. A replaced
 * one keeps its place, so a recoloured highlight does not jump in the list.
 */
export function withChange(
  held: readonly Annotation[],
  id: string,
  stored: Annotation | null,
): readonly Annotation[] {
  if (stored === null) {
    return held.filter((annotation) => annotation.id !== id);
  }

  return held.some((annotation) => annotation.id === id)
    ? held.map((annotation) => (annotation.id === id ? stored : annotation))
    : [...held, stored];
}
