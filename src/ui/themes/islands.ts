/**
 * The base the Islands layout puts every pane on (2026-11-14): one colour filling the window
 * behind the islands, a step darker than the theme's chrome, so the islands read as lifted.
 *
 * Worked out from each theme rather than written into each, so the twenty-four themes need
 * nothing new and a theme added later gets a base without anyone remembering to: a light
 * theme's chrome taken a tenth of the way to its text, a dark theme's nearly half the way to
 * black. A chrome already black or near it (Contrast Dark) has nothing darker to step to, so
 * its base steps a little towards its text instead: what matters is that the islands stand
 * apart. `themes.test.ts` holds the window bar's controls, which sit on it, to 3:1.
 */
import type { Theme } from "./index";

const channels = (hex: string): readonly number[] =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

/** `from` moved `by` (0–1) of the way towards `to`; both `#rrggbb`. */
export function mixed(from: string, to: string, by: number): string {
  const a = channels(from);
  const b = channels(to);

  return `#${a.map((value, at) => Math.round(value + ((b[at] ?? value) - value) * by).toString(16).padStart(2, "0")).join("")}`;
}

/** The Islands base for `theme`. */
export function islandBase(theme: Pick<Theme, "palette" | "scheme">): string {
  const { chrome, text } = theme.palette;

  if (theme.scheme === "light") {
    return mixed(chrome, text, 0.1);
  }

  const nearBlack = channels(chrome).every((value) => value < 16);

  return nearBlack ? mixed(chrome, text, 0.08) : mixed(chrome, "#000000", 0.45);
}
