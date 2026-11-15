/**
 * The notes' text colours (`paint.css`, 2026-11-15) are readable in every theme: each text
 * colour on the theme's note ground, and the theme's own text on each background.
 */
import { describe, expect, it } from "vitest";

import { COLOURS } from "../../notes/paint";
import { over, ratio, solid } from "./contrast";
import { PALETTE_ORDER, THEMES } from "./index";

const SHEET = import.meta.glob<string>("../styles/paint.css", { query: "?raw", import: "default", eager: true });

/** The `--paint-*` values one block of `paint.css` defines. */
function block(selector: string): Map<string, string> {
  const css = Object.values(SHEET)[0] ?? "";
  const start = css.indexOf(`${selector} {`);
  const body = start === -1 ? "" : css.slice(start, css.indexOf("}", start));

  return new Map([...body.matchAll(/--(paint-[\w-]+): ([^;]+);/g)].map((match) => [match[1] ?? "", match[2] ?? ""]));
}

const SETS = { light: block(":root"), dark: block(':root[data-scheme="dark"]') };

describe.each(PALETTE_ORDER)("the notes' colours in %s", (name) => {
  const { scheme, palette } = THEMES[name];
  const set = SETS[scheme];

  it.each(COLOURS)("draws %s text readably on the notes, and the notes' text readably on it", (colour) => {
    const text = set.get(`paint-${colour}`);
    const background = set.get(`paint-${colour}-bg`);

    expect(text, `--paint-${colour} in the ${scheme} set`).toBeDefined();
    expect(background, `--paint-${colour}-bg in the ${scheme} set`).toBeDefined();
    expect(ratio(solid(text ?? ""), solid(palette.surface))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(solid(palette.text), over(background ?? "", palette.surface))).toBeGreaterThanOrEqual(4.5);
  });
});
