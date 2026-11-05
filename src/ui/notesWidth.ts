/**
 * How wide the notes may be, given the room the document and the notes share.
 *
 * The chosen width is held to what the window can give *now*, every render, rather than
 * when it was chosen: a width picked on an external monitor would otherwise leave the
 * document no room at all on the laptop screen.
 */

/** The narrowest the notes go: the pane's own `min-width`. */
export const NOTES_MIN = 300;

/** What the document always keeps: room for a page and the viewer's toolbar. */
export const VIEWER_MIN = 360;

/** One arrow-key press, and one with Shift held. */
export const KEY_STEP = 16;
export const KEY_STEP_LARGE = 64;

/** The widest the notes can be in an area this wide. */
export function widestNotes(area: number): number {
  return Math.max(NOTES_MIN, area - VIEWER_MIN);
}

/**
 * `desired`, held between the narrowest notes and the widest that leave the document its
 * room. When the area cannot fit both, the notes keep their minimum: shrinking them below
 * it would lose the editor, and the document scrolls where the notes cannot.
 */
export function fitNotesWidth(desired: number, area: number): number {
  return Math.round(Math.min(Math.max(desired, NOTES_MIN), widestNotes(area)));
}
