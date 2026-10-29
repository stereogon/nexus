/**
 * Every `var(--token)` resolves to a token that exists.
 *
 * A fourth static check on the stylesheets, and like the other three it exists because the
 * mistake it catches reached further than it should have. Writing `var(--surface-sunken)`
 * and `var(--text-primary)` when the tokens are `--track` and `--text` produces no error
 * anywhere: CSS treats an undefined custom property as an invalid value, the declaration
 * is dropped, and the element simply renders without it. A close button with no hover
 * background looks like a close button nobody styled, which is indistinguishable from a
 * design decision until someone compares it with the canvas.
 *
 * Only the direction that can be wrong is asserted. A token defined and not yet used is
 * ordinary — the palette is taken from the canvas as a set, and §3 makes that set the
 * source rather than the subset the code happens to reference today.
 */
import { describe, expect, it } from "vitest";

const STYLESHEETS = import.meta.glob<string>("./styles/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** CSS with its comments removed, so an example in prose is not read as a declaration. */
function uncommented(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** Every custom property given a value, anywhere in the stylesheets. */
function defined(): Set<string> {
  const names = new Set<string>();

  for (const css of Object.values(STYLESHEETS)) {
    for (const [, name] of uncommented(css).matchAll(/(--[\w-]+)\s*:/g)) {
      if (name !== undefined) {
        names.add(name);
      }
    }
  }

  return names;
}

/** Every custom property read back, with the file that reads it. */
function used(): readonly { readonly file: string; readonly name: string }[] {
  const reads: { file: string; name: string }[] = [];

  for (const [path, css] of Object.entries(STYLESHEETS)) {
    for (const [, name] of uncommented(css).matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (name !== undefined) {
        reads.push({ file: path.replace("./styles/", ""), name });
      }
    }
  }

  return reads;
}

describe("the design tokens", () => {
  it("are defined wherever they are read", () => {
    const known = defined();
    const missing = used().filter((read) => !known.has(read.name));

    // Reported as pairs so a failure names the file as well as the token: the same
    // misspelling in two stylesheets is two fixes, not one.
    expect(missing).toEqual([]);
  });

  it("are actually found, rather than the scan quietly matching nothing", () => {
    // Guards the test itself. A regex that matched no tokens would pass the check above
    // for ever while looking as though it were working -- which is exactly how the first
    // version of the text-layer fixture fooled itself.
    expect(defined().size).toBeGreaterThan(30);
    expect(used().length).toBeGreaterThan(50);
  });

  it("include the ones the brand is defined by", () => {
    // §3 names these specifically, so a rename that silently dropped one would be caught
    // here rather than by noticing the app had gone grey.
    for (const token of ["--accent", "--accent-ink", "--surface", "--text"]) {
      expect(defined()).toContain(token);
    }
  });
});
