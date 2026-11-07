/**
 * How wide the sidebar may be, given the window's room for every pane (2026-11-07).
 *
 * Held every render to what the window can give now, as the notes' width is
 * (`notesWidth.ts`), so a width chosen on an external monitor still leaves the laptop's
 * window room to read in.
 */

/** The narrowest: room for a row's icon and a few letters of its name. */
export const SIDEBAR_MIN = 200;

/** The widest that is still a sidebar rather than a second page. */
export const SIDEBAR_MAX = 480;

/** What the panes beside the sidebar always keep. */
export const BESIDE_MIN = 520;

/** The widest the sidebar can be in a window whose panes are `area` wide. */
export function widestSidebar(area: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, area - BESIDE_MIN));
}

/** `desired`, held between the narrowest sidebar and the widest the window allows. */
export function fitSidebarWidth(desired: number, area: number): number {
  return Math.round(Math.min(Math.max(desired, SIDEBAR_MIN), widestSidebar(area)));
}
