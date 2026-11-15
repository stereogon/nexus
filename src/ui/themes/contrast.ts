/**
 * Measuring colours as WCAG does, for the tests that hold every theme readable
 * (`themes.test.ts`, `paint.test.ts`). Moved out of `themes.test.ts` on 2026-11-15 when the
 * notes' text colours needed the same measure.
 */

export type Rgb = readonly [number, number, number];

export function parse(colour: string): { rgb: Rgb; alpha: number } {
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
export function over(colour: string, under: string): Rgb {
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

export function ratio(a: Rgb, b: Rgb): number {
  const [one, two] = [luminance(a), luminance(b)];

  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

export const solid = (colour: string): Rgb => parse(colour).rgb;
