/**
 * The fifteen themes, as data.
 *
 * From the redesign canvas (<https://claude.ai/artifact/DqL93ozsfahcZsqKXzE4fT>, 2026-11-07),
 * where the user asked for "at least 10-15 different color theme styles … funky, plain
 * modern, neon, dark contrast". Each theme sets the window's own colours: grounds, text,
 * borders and one accent. Three things are the same in every theme, because they carry
 * meaning rather than mood: the page stays white (no inverted documents, CLAUDE.md §3), the
 * four highlight meanings keep their colours and letters, and `accent-ink`, which is drawn
 * on that white page, stays the one value sized for white.
 *
 * Kept here rather than as fifteen stylesheet blocks so the colours exist once: `useTheme`
 * writes the chosen palette onto the document, and `themes.test.ts` measures the same
 * values — every text colour against the grounds it sits on — so a theme cannot ship
 * unreadable. `tokens.css` keeps Paper's values as the starting point, and the colours
 * every dark theme shares (code, washes) under `[data-scheme="dark"]`.
 */

import { DARK_THEMES } from "./dark";
import { LIGHT_THEMES } from "./light";

/** Every theme that can be chosen, plus following macOS between Paper and Ink. */
export const THEME_NAMES = [
  "system",
  "paper",
  "ink",
  "plain",
  "graphite",
  "contrast",
  "contrast-dark",
  "neon",
  "funky",
  "solar",
  "fjord",
  "forest",
  "sakura",
  "ocean",
  "terminal",
  "sepia",
] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

/** A theme that is a palette, which is every one but `system`. */
export type PaletteName = Exclude<ThemeName, "system">;

/** The CSS custom properties a theme sets, without their leading `--`. */
/** A type alias rather than an interface, so it is a `Record<string, string>` to `Object.entries`. */
export type Palette = {
  readonly accent: string;
  readonly "on-accent": string;
  readonly "accent-soft": string;
  readonly "accent-wash": string;
  readonly scrim: string;
  readonly chrome: string;
  readonly surface: string;
  readonly "viewer-bed": string;
  readonly border: string;
  readonly "border-strong": string;
  readonly text: string;
  readonly "text-secondary": string;
  readonly "text-meta": string;
  readonly "text-faint": string;
  readonly "row-text": string;
  readonly field: string;
  readonly track: string;
  readonly "segment-on": string;
  readonly kbd: string;
  readonly "kbd-border": string;
  readonly "code-bg": string;
  readonly "code-border": string;
};

export interface Theme {
  readonly label: string;
  /** Which family it belongs to: decides `color-scheme` and the shared dark colours. */
  readonly scheme: "light" | "dark";
  /** One line for the picker. */
  readonly mood: string;
  readonly palette: Palette;
}

export const THEMES: Readonly<Record<PaletteName, Theme>> = { ...LIGHT_THEMES, ...DARK_THEMES };

/** The palette names in the picker's order: the defaults first, then light, then dark. */
export const PALETTE_ORDER: readonly PaletteName[] = [
  "paper",
  "ink",
  "plain",
  "graphite",
  "contrast",
  "contrast-dark",
  "funky",
  "solar",
  "sakura",
  "sepia",
  "neon",
  "fjord",
  "forest",
  "ocean",
  "terminal",
];

/** The palette a theme name stands for, given whether macOS is in dark mode. */
export function resolve(name: ThemeName, systemDark: boolean): PaletteName {
  if (name === "system") {
    return systemDark ? "ink" : "paper";
  }

  return name;
}

/**
 * Puts a theme on the document: its palette as custom properties on the root, which win
 * over `tokens.css`, and `data-scheme` for the colours shared by every dark theme.
 */
export function applyTheme(root: HTMLElement, name: PaletteName): void {
  const theme = THEMES[name];

  for (const [token, value] of Object.entries<string>(theme.palette)) {
    root.style.setProperty(`--${token}`, value);
  }

  root.setAttribute("data-theme", name);
  root.setAttribute("data-scheme", theme.scheme);
  root.style.colorScheme = theme.scheme;
}
