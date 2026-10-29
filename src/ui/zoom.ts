/**
 * The zoom levels the viewer offers, and how `−` and `+` move between them.
 *
 * Extracted from `PdfViewer` on 2026-10-29. Steps rather than a blind multiplier because
 * the canvas's toolbar shows a percentage, and repeated multiplication produces the
 * numbers nobody wants to read — 132%, 159% — instead of landing on the round ones.
 */

/** The range the viewer will scale to, past which the controls stop. */
export const ZOOM_LIMITS = { min: 0.25, max: 6 } as const;

/** The steps `−` and `+` move through. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6] as const;

/** Either fitted to the pane's width, or pinned at a scale someone chose. */
export type Zoom = { readonly kind: "fit" } | { readonly kind: "at"; readonly scale: number };

/**
 * The next step up or down from `scale`, or `scale` itself at either end.
 *
 * The tolerance matters: a fitted scale is whatever the pane's width made it, so it
 * almost never equals a step exactly. Comparing with `>` alone would make `+` from a
 * fit-width of 0.9999 return 1, which looks like the button having done nothing.
 */
export function stepFrom(scale: number, direction: 1 | -1): number {
  const ordered = direction === 1 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  const next = ordered.find((step) =>
    direction === 1 ? step > scale + 0.001 : step < scale - 0.001,
  );

  return next ?? scale;
}
