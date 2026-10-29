/**
 * Every class name the components use exists in the stylesheet, and vice versa.
 *
 * # Why this test exists
 *
 * On 2026-10-29 the window shipped with `.pane` and `.pane-empty` referenced by `App.tsx`
 * and **defined nowhere**: class names invented while writing a component and never added
 * to `theme.css`. The empty state rendered as an unstyled box at the top left, and nothing
 * in the repository could notice — a renderer is needed to see a layout, and even a
 * renderer under jsdom has no layout engine.
 *
 * This is the cheap half of that problem, and it catches it exactly: a name used but never
 * defined is a static fact about two files, needing no browser at all.
 *
 * It does **not** catch a rule that exists but is wrong — a missing `flex`, a centring
 * trick that fails for an over-wide child. Only a real browser catches those, which is
 * what the Playwright suite in Milestone 5 is for.
 */
import { describe, expect, it } from "vitest";

import STYLESHEET from "./theme.css?raw";

/**
 * Every component's source, as text.
 *
 * Read through Vite rather than `node:fs`, which would need `@types/node` for a test that
 * only wants two strings. It also keeps the test honest about *which* files ship: the glob
 * resolves the same way the bundler does.
 */
const SOURCES = import.meta.glob<string>("../**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

function sources(): readonly { readonly file: string; readonly text: string }[] {
  return Object.entries(SOURCES)
    .filter(([file]) => !file.endsWith(".test.tsx"))
    .map(([file, text]) => ({ file, text }));
}

/** The class names a source file asks for, from `className="a b"` and `"a" : "b"` forms. */
function used(text: string): Set<string> {
  const names = new Set<string>();

  // Matches the literal strings inside any className attribute, including both arms of a
  // ternary, which is how the conditional ones in this codebase are written.
  for (const attribute of text.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/gu)) {
    const literal = attribute[1];
    const expression = attribute[2];

    if (literal !== undefined) {
      for (const name of literal.split(/\s+/u)) {
        if (name !== "") {
          names.add(name);
        }
      }
    }

    if (expression !== undefined) {
      for (const quoted of expression.matchAll(/"([^"]*)"|`([^`${}]*)`/gu)) {
        for (const name of (quoted[1] ?? quoted[2] ?? "").split(/\s+/u)) {
          if (name !== "") {
            names.add(name);
          }
        }
      }
    }
  }

  return names;
}

/** Every class name the stylesheet defines a rule for. */
function defined(): Set<string> {
  // Comments first: `.pane` inside prose is not a definition.
  const rules = STYLESHEET.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
  const names = new Set<string>();

  for (const match of rules.matchAll(/\.(-?[_a-zA-Z][\w-]*)/gu)) {
    const name = match[1];

    if (name !== undefined) {
      names.add(name);
    }
  }

  return names;
}

describe("the stylesheet and the components agree", () => {
  it("defines every class name a component asks for", () => {
    const styled = defined();
    const missing: string[] = [];

    for (const { file, text } of sources()) {
      for (const name of used(text)) {
        if (!styled.has(name)) {
          missing.push(`${file}: .${name}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("finds the class names, so an empty result cannot pass silently", () => {
    // Without this, a regex that matched nothing would make the test above pass for every
    // possible stylesheet -- the failure mode of every test that asserts an empty list.
    const names = sources().flatMap(({ text }) => [...used(text)]);

    expect(names).toContain("sidebar");
    expect(names).toContain("viewer-bar");
    expect(names.length).toBeGreaterThan(30);
    expect(defined().size).toBeGreaterThan(40);
  });
});
