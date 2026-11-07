// @vitest-environment jsdom
/**
 * Every theme is readable: measured, not eyeballed.
 *
 * The redesign canvas claimed every text colour passes 4.5:1 on its own ground; the colours
 * had been picked by eye, so this is where the claim is made true. WCAG's relative
 * luminance and contrast ratio, with translucent colours (a selected row's wash, for one)
 * blended over what they sit on, because that composite is what a person actually reads.
 */
import { describe, expect, it } from "vitest";

import { STANDARD_HIGHLIGHTS, highlightsOf, type Highlight } from "./highlights";
import { PALETTE_ORDER, THEME_NAMES, THEMES, applyTheme, resolve, type Palette } from "./index";

const TOKENS = import.meta.glob<string>("../styles/tokens.css", { query: "?raw", import: "default", eager: true });

type Rgb = readonly [number, number, number];

function parse(colour: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour);

  if (hex?.[1] !== undefined) {
    const value = Number.parseInt(hex[1], 16);

    return { rgb: [(value >> 16) & 255, (value >> 8) & 255, value & 255], alpha: 1 };
  }

  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(colour);

  if (rgba !== null) {
    return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: Number(rgba[4]) };
  }

  throw new Error(`not a colour this test reads: ${colour}`);
}

/** `colour` as it looks laid over `under`, which must be opaque. */
function over(colour: string, under: string): Rgb {
  const top = parse(colour);
  const bottom = parse(under).rgb;

  const mix = (i: 0 | 1 | 2) => top.rgb[i] * top.alpha + bottom[i] * (1 - top.alpha);

  return [mix(0), mix(1), mix(2)];
}

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const s = value / 255;

    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [one, two] = [luminance(a), luminance(b)];

  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

const solid = (colour: string): Rgb => parse(colour).rgb;

/** Hue in degrees and saturation, for telling an accent from the highlight colours. */
function hueOf([r, g, b]: Rgb): { hue: number; saturation: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const saturation = max === 0 ? 0 : delta / max;

  if (delta === 0) {
    return { hue: 0, saturation };
  }

  const raw = max === rn ? ((gn - bn) / delta) % 6 : max === gn ? (bn - rn) / delta + 2 : (rn - gn) / delta + 4;

  return { hue: (raw * 60 + 360) % 360, saturation };
}

const WHITE = "#ffffff";
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const hueOfColour = (colour: string) => hueOf(solid(colour)).hue;

/** What a person reads, and the grounds each sits on. */
const BODY_TEXT: readonly (keyof Palette)[] = ["text", "text-secondary", "text-meta", "row-text"];
const GROUNDS: readonly (keyof Palette)[] = ["chrome", "surface", "field"];

describe.each(PALETTE_ORDER)("the %s theme", (name) => {
  const palette = THEMES[name].palette;

  it.each(BODY_TEXT)("keeps %s at 4.5:1 or better on every ground", (text) => {
    for (const ground of GROUNDS) {
      expect(ratio(solid(palette[text]), solid(palette[ground])), `${text} on ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the faint text, which is never the only way to read something, at 3:1", () => {
    for (const ground of GROUNDS) {
      expect(ratio(solid(palette["text-faint"]), solid(palette[ground])), `faint on ${ground}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the accent readable as text, including on a selected row's wash", () => {
    const accent = solid(palette.accent);

    expect(ratio(accent, solid(palette.surface))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(accent, solid(palette.chrome))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(accent, over(palette["accent-soft"], palette.chrome)), "on a selected row").toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a label on the accent readable", () => {
    expect(ratio(solid(palette["on-accent"]), solid(palette.accent))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps code and shortcut badges readable", () => {
    expect(ratio(solid(palette.text), solid(palette["code-bg"]))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(solid(palette["text-meta"]), solid(palette.kbd))).toBeGreaterThanOrEqual(4.5);
  });

  const highlights = Object.entries(highlightsOf(THEMES[name].highlights));

  it("keeps the accent apart from its own four highlight colours, so a meaning is never mistaken for chrome", () => {
    const accent = hueOf(solid(palette.accent));

    // A grey or black accent cannot be mistaken for a hue.
    if (accent.saturation < 0.2) {
      return;
    }

    for (const [semantic, { colour }] of highlights) {
      expect(hueDistance(accent.hue, hueOfColour(colour)), `accent against ${semantic}`).toBeGreaterThanOrEqual(25);
    }
  });

  // The bar the standard four set, so a swapped colour is never the weak one.
  it.each(highlights)("draws %s visibly on the white page, with the page's text readable over it", (_, { wash }) => {
    expect(ratio(solid(WHITE), over(wash, WHITE))).toBeGreaterThanOrEqual(1.25);
    expect(ratio(solid("#1c1b19"), over(wash, WHITE))).toBeGreaterThanOrEqual(7);
  });

  it("keeps the letter chips readable: dark ink on K, white on D, E and Q", () => {
    const set = highlightsOf(THEMES[name].highlights);

    expect(ratio(solid("#3a2a05"), solid(set.key.colour))).toBeGreaterThanOrEqual(7);

    for (const { colour } of [set.definition, set.exam, set.question]) {
      expect(ratio(solid(WHITE), solid(colour)), colour).toBeGreaterThanOrEqual(3.1);
    }
  });

  it("draws its ink, the page's chrome, readable on white and in the accent's own hue", () => {
    expect(ratio(solid(palette["accent-ink"]), solid(WHITE))).toBeGreaterThanOrEqual(4.5);

    const accent = hueOf(solid(palette.accent));

    if (accent.saturation >= 0.2) {
      expect(hueDistance(accent.hue, hueOfColour(palette["accent-ink"]))).toBeLessThanOrEqual(3);
    }
  });

  it("keeps the four highlights apart from one another and from the page's accent ink", () => {
    const ink = hueOf(solid(palette["accent-ink"]));

    for (const [index, [semantic, { colour }]] of highlights.entries()) {
      if (ink.saturation >= 0.2) {
        expect(hueDistance(hueOfColour(colour), ink.hue), `${semantic} against accent ink`).toBeGreaterThanOrEqual(25);
      }

      for (const [other, { colour: second }] of highlights.slice(index + 1)) {
        expect(hueDistance(hueOfColour(colour), hueOfColour(second)), `${semantic} against ${other}`).toBeGreaterThanOrEqual(30);
      }
    }
  });
});

describe("the set of themes", () => {
  it("offers every palette in the picker once, and system besides", () => {
    expect([...PALETTE_ORDER].sort()).toEqual(Object.keys(THEMES).sort());
    expect(new Set(THEME_NAMES)).toEqual(new Set(["system", ...PALETTE_ORDER]));
    expect(PALETTE_ORDER).toHaveLength(24);
  });

  it("gives most of the accents a hue other than pink", () => {
    const pink = PALETTE_ORDER.filter((name) => {
      const { hue, saturation } = hueOf(solid(THEMES[name].palette.accent));

      return saturation >= 0.2 && (hue >= 290 || hue < 15);
    });

    // Paper and Ink, the brand's own, and Sakura, whose point it is.
    expect(pink.sort()).toEqual(["ink", "paper", "sakura"]);
  });

  it("follows macOS between Paper and Ink", () => {
    expect(resolve("system", false)).toBe("paper");
    expect(resolve("system", true)).toBe("ink");
    expect(resolve("neon", false)).toBe("neon");
  });
});

describe("putting a theme on the document", () => {
  it("writes every token of the palette, its name and its family", () => {
    const root = document.createElement("div");

    applyTheme(root, "neon");

    expect(root.style.getPropertyValue("--accent")).toBe(THEMES.neon.palette.accent);
    expect(root.style.getPropertyValue("--chrome")).toBe(THEMES.neon.palette.chrome);
    expect(root.getAttribute("data-theme")).toBe("neon");
    expect(root.getAttribute("data-scheme")).toBe("dark");
  });

  it("writes a theme's highlight colours, and the standard ones back for a theme without swaps", () => {
    const root = document.createElement("div");
    const swapped: Highlight | undefined = THEMES.sky.highlights?.question;

    applyTheme(root, "sky");
    expect(swapped).toBeDefined();
    expect(root.style.getPropertyValue("--semantic-question")).toBe(swapped?.colour);
    expect(root.style.getPropertyValue("--highlight-question")).toBe(swapped?.wash);

    applyTheme(root, "paper");
    expect(root.style.getPropertyValue("--semantic-question")).toBe(STANDARD_HIGHLIGHTS.question.colour);
    expect(root.style.getPropertyValue("--exam-wash")).toBe("rgba(224, 82, 60, 0.12)");
  });

  it("sets only tokens the stylesheets define, so none is a dead letter", () => {
    const css = Object.values(TOKENS).join("\n");
    const root = document.createElement("div");

    applyTheme(root, "paper");

    const tokens = Array.from(root.style).filter((property) => property.startsWith("--"));

    expect(tokens.length).toBeGreaterThan(Object.keys(THEMES.paper.palette).length);

    for (const token of tokens.map((property) => property.slice(2))) {
      expect(css, `--${token}`).toContain(`--${token}:`);
    }
  });
});
