/**
 * The themes, as data.
 *
 * From the redesign canvas (<https://claude.ai/artifact/DqL93ozsfahcZsqKXzE4fT>, 2026-11-07),
 * where the user asked for "at least 10-15 different color theme styles … funky, plain
 * modern, neon, dark contrast". Each theme sets the window's own colours: grounds, text,
 * borders and one accent. The page stays white in every theme (no inverted documents,
 * CLAUDE.md §3), so what is drawn on it uses `accent-ink`: the theme's accent in its own
 * hue, darkened until it reads on white. One fixed mulberry until 2026-11-07, when the user
 * saw the page's icons not matching the theme around them. The four highlight meanings keep their letters everywhere; their colours
 * move aside in a theme whose accent would clash (`./highlights`). Fifteen at first, all but
 * three of the accents pink; the user asked for blues, greens and more (2026-11-07), and
 * the set grew to twenty-four. Cyberpunk 2077 made twenty-five (2026-11-15), and Funky was
 * redone the same day, its orange chrome and teal too loud for the user's eyes.
 *
 * Kept here rather than as stylesheet blocks so the colours exist once: `useTheme`
 * writes the chosen palette onto the document, and `themes.test.ts` measures the same
 * values — every text colour against the grounds it sits on — so a theme cannot ship
 * unreadable. `tokens.css` keeps Paper's values as the starting point, and the colours
 * every dark theme shares (code, washes) under `[data-scheme="dark"]`.
 */

import { DARK_THEMES } from "./dark";
import { DARK_COLOUR_THEMES } from "./darkColours";
import { highlightsOf, highlightTokens, type HighlightSet } from "./highlights";
import { islandBase } from "./islands";
import { LIGHT_THEMES } from "./light";
import { LIGHT_COLOUR_THEMES } from "./lightColours";

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
  "sky",
  "meadow",
  "citrus",
  "lagoon",
  "indigo",
  "midnight",
  "emerald",
  "ember",
  "aurora",
  "cyberpunk",
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
  /** The accent darkened to read on the always-white page: chrome drawn on a document. */
  readonly "accent-ink": string;
  /** A text selection on the page, in the ink at 0.3 so the words stay readable through it. */
  readonly "page-selection": string;
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
  /** Highlight colours swapped for this theme, where its accent would clash (`./highlights`). */
  readonly highlights?: Partial<HighlightSet>;
}

export const THEMES: Readonly<Record<PaletteName, Theme>> = {
  ...LIGHT_THEMES,
  ...LIGHT_COLOUR_THEMES,
  ...DARK_THEMES,
  ...DARK_COLOUR_THEMES,
};

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
  "sky",
  "meadow",
  "citrus",
  "lagoon",
  "indigo",
  "neon",
  "fjord",
  "forest",
  "ocean",
  "terminal",
  "midnight",
  "emerald",
  "ember",
  "aurora",
  "cyberpunk",
];

/** The palette a theme name stands for, given whether macOS is in dark mode. */
export function resolve(name: ThemeName, systemDark: boolean): PaletteName {
  if (name === "system") {
    return systemDark ? "ink" : "paper";
  }

  return name;
}

/**
 * Puts a theme on the document: its palette, its highlight colours and its Islands base
 * (`./islands`) as custom properties
 * on the root, which win over `tokens.css`, and `data-scheme` for the colours shared by
 * every dark theme.
 */
export function applyTheme(root: HTMLElement, name: PaletteName): void {
  const theme = THEMES[name];

  // Every highlight token is written, swapped or not, so one theme's swap never outlives it.
  const tokens = {
    ...theme.palette,
    ...highlightTokens(highlightsOf(theme.highlights), theme.scheme),
    // Drawn only in the Islands layout, but set always, so switching layout needs no theme work.
    "island-base": islandBase(theme),
  };

  for (const [token, value] of Object.entries<string>(tokens)) {
    root.style.setProperty(`--${token}`, value);
  }

  root.setAttribute("data-theme", name);
  root.setAttribute("data-scheme", theme.scheme);
  root.style.colorScheme = theme.scheme;
}
