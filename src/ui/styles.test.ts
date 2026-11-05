/**
 * Every class name the components use exists in the stylesheets, and vice versa.
 *
 * # Why this test exists
 *
 * On 2026-10-29 the window shipped with `.pane` and `.pane-empty` referenced by `App.tsx`
 * and **defined nowhere**: class names invented while writing a component and never added
 * to the stylesheet. The empty state rendered as an unstyled box at the top left, and
 * nothing in the repository could notice — a renderer is needed to see a layout, and even
 * a renderer under jsdom has no layout engine.
 *
 * This is the cheap half of that problem, and it catches it exactly: a name used but never
 * defined is a static fact about two sets of files, needing no browser at all.
 *
 * It does **not** catch a rule that exists but is wrong — a missing `flex`, a centring
 * trick that fails for an over-wide child. Only a real browser catches those, which is
 * what the Playwright suite in Milestone 5 is for.
 *
 * # Why there are two notions of "used"
 *
 * The two directions need different strictness, and using one extractor for both would
 * make one of them wrong.
 *
 * - **Used but undefined** is a bug, so `used()` is precise: only `className` positions
 *   count. A loose reading would demand a rule for every string in the codebase.
 * - **Defined but unused** is a cleanup, so `mentioned()` is deliberately loose: any
 *   string literal anywhere counts. Over-reading here only means a dead rule survives a
 *   little longer, while under-reading would delete a rule that is genuinely in use.
 */
import { describe, expect, it } from "vitest";

/** Every stylesheet, by path. A new one is covered the moment it is imported. */
const STYLESHEETS = import.meta.glob<string>("./styles/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Every component's source, as text.
 *
 * Read through Vite rather than `node:fs`, which would need `@types/node` for a test that
 * only wants some strings. It also keeps the test honest about *which* files ship: the
 * glob resolves the same way the bundler does.
 */
const COMPONENTS = import.meta.glob<string>("../**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Every module, component or not, for the loose reading. */
const MODULES = import.meta.glob<string>("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

function sources(from: Record<string, string>): readonly {
  readonly file: string;
  readonly text: string;
}[] {
  return Object.entries(from)
    .filter(([file]) => !file.includes(".test."))
    .map(([file, text]) => ({ file, text }));
}

/** The names in a whitespace-separated class list. */
function split(into: Set<string>, list: string): void {
  for (const name of list.split(/\s+/u)) {
    if (name !== "") {
      into.add(name);
    }
  }
}

/**
 * The region after a `className=`: either a quoted string or a braced expression.
 *
 * Walked by counting braces rather than matched by a regex, because `` `dot ${x}` ``
 * contains a `}` that a non-greedy match stops at. That is not hypothetical: it is how
 * `.dot`, `.notable` and `.informational` went unchecked until this was written properly.
 */
function expression(text: string, from: number): { readonly body: string; readonly next: number } {
  if (text[from] === '"') {
    const end = text.indexOf('"', from + 1);

    return end === -1
      ? { body: "", next: text.length }
      : { body: text.slice(from, end + 1), next: end + 1 };
  }

  if (text[from] !== "{") {
    return { body: "", next: from + 1 };
  }

  let depth = 0;

  for (let at = from; at < text.length; at += 1) {
    const character = text[at];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return { body: text.slice(from, at + 1), next: at + 1 };
      }
    }
  }

  return { body: text.slice(from), next: text.length };
}

/**
 * Source with its comments removed.
 *
 * Necessary before looking for strings, not just tidy: prose in this codebase quotes
 * identifiers in backticks, and a regex scanning for template literals reads a pair of
 * those as one. A comment mentioning `currentColor` and `#` was enough to swallow the
 * `className` line below it, which is how `.pixel-ghost` first reported as unused while
 * being used on the very next line.
 *
 * Line comments are stripped only where the `//` is not part of `://`, so a URL inside a
 * string survives.
 */
function uncommented(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//gu, "").replaceAll(/(^|[^:])\/\/.*$/gmu, "$1");
}

/** Every quoted or templated string in a fragment of source, with `${…}` holes removed. */
function literals(body: string): readonly string[] {
  return [...body.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/gu)].map((found) =>
    (found[1] ?? found[2] ?? found[3] ?? "").replaceAll(/\$\{[^}]*\}/gu, " "),
  );
}

/** The class names a component asks for. Precise: `className` positions only. */
function used(text: string): Set<string> {
  const names = new Set<string>();
  const source = uncommented(text);
  let at = source.indexOf("className=");

  while (at !== -1) {
    const { body, next } = expression(source, at + "className=".length);

    for (const literal of literals(body)) {
      split(names, literal);
    }

    at = source.indexOf("className=", next);
  }

  return names;
}

/** Every name mentioned in any string anywhere. Loose, on purpose — see the header. */
function mentioned(): Set<string> {
  const names = new Set<string>();

  for (const { text } of sources(MODULES)) {
    for (const literal of literals(uncommented(text))) {
      split(names, literal);
    }
  }

  return names;
}

/** Every class name the stylesheets define a rule for. */
function defined(): Set<string> {
  const names = new Set<string>();

  for (const [, sheet] of Object.entries(STYLESHEETS)) {
    // Comments first: `.pane` inside prose is not a definition. Then statement at-rules,
    // because `@import "./tokens.css"` otherwise contributes a class called `css`.
    const rules = sheet
      .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
      .replaceAll(/@[\w-]+[^;{]*;/gu, "");

    for (const found of rules.matchAll(/\.(-?[_a-zA-Z][\w-]*)/gu)) {
      const name = found[1];

      if (name !== undefined) {
        names.add(name);
      }
    }
  }

  return names;
}

/**
 * Classes pdf.js puts on its own elements.
 *
 * `markedContent` wraps tagged content in a generated text layer. No component writes it,
 * and the rule has to exist anyway, so it is named here rather than silently excused by a
 * looser rule that would also excuse a real mistake.
 */
const APPLIED_BY_PDFJS = new Set(["markedContent"]);

/**
 * Classes CodeMirror puts on the editor it builds, styled in `notes.css`. Named for the
 * same reason as pdf.js's: no component writes them, and a looser rule would also excuse
 * a real mistake.
 */
const APPLIED_BY_CODEMIRROR = new Set([
  "cm-editor",
  "cm-focused",
  "cm-scroller",
  "cm-content",
  "cm-placeholder",
]);

/**
 * The stylesheets that hold shared primitives rather than one pane's layout.
 *
 * `index.css` imports these before any pane, which is what lets a pane tighten a shared
 * control. The same ordering makes a positioned rule in here dangerous: it follows the
 * class into every pane that reuses it.
 */
const SHARED = ["tokens.css", "text.css", "controls.css"];

/** Properties that place an element somewhere, as opposed to styling it. */
const PLACES_ITSELF = /(position:\s*(absolute|fixed))|(^\s*(top|right|bottom|left):)/gmu;

describe("the shared stylesheets stay shareable", () => {
  it("keeps positioning out of them", () => {
    // `.kbd` set `position: absolute; right: 20px; top: 20px` for the sidebar's search
    // field. Reusing the same pill for an inline shortcut in a sentence sent it out of its
    // paragraph and onto the title bar's diagnostics button, nearly hiding it. A shared
    // primitive says what a thing looks like; where it sits belongs to the pane around it.
    const placed = Object.entries(STYLESHEETS)
      .filter(([file]) => SHARED.some((shared) => file.endsWith(shared)))
      .flatMap(([file, sheet]) =>
        [...sheet.replaceAll(/\/\*[\s\S]*?\*\//gu, "").matchAll(PLACES_ITSELF)].map(
          (found) => `${file}: ${found[0].trim()}`,
        ),
      );

    expect(placed).toEqual([]);
  });

  it("names stylesheets that exist, so a rename cannot make it vacuous", () => {
    const files = Object.keys(STYLESHEETS);

    for (const shared of SHARED) {
      expect(files.some((file) => file.endsWith(shared))).toBe(true);
    }
  });
});

describe("the stylesheets and the components agree", () => {
  it("defines every class name a component asks for", () => {
    const rules = defined();
    const missing = sources(COMPONENTS).flatMap(({ file, text }) =>
      [...used(text)].filter((name) => !rules.has(name)).map((name) => `${file}: .${name}`),
    );

    expect(missing).toEqual([]);
  });

  it("has no rule nothing uses", () => {
    // Dead rules are how a stylesheet grows without anyone deciding to grow it. Ten were
    // found when this was first run: leftovers from a component deleted three commits
    // earlier, still styled, still shipped.
    const seen = mentioned();
    const dead = [...defined()]
      .filter(
        (name) => !seen.has(name) && !APPLIED_BY_PDFJS.has(name) && !APPLIED_BY_CODEMIRROR.has(name),
      )
      .sort();

    expect(dead).toEqual([]);
  });

  it("finds names on both sides, so an empty result cannot pass silently", () => {
    // Worth knowing what this guard cannot do: it cannot tell a *stale* file list from a
    // current one, because a stale list still has plausible counts. That hazard is real --
    // `import.meta.glob` is resolved at transform time and the transform cache is keyed by
    // this file's own content -- and it is prevented by `fsModuleCache: false` in the Vite
    // config, not by anything assertable here.
    // Without this, a regex that matched nothing would make both tests above vacuous --
    // and one of them did exactly that: Vitest stubs CSS imports unless `css: true` is
    // set, so the stylesheet arrived as an empty string and the suite stayed green.
    const names = sources(COMPONENTS).flatMap(({ text }) => [...used(text)]);

    expect(names).toContain("sidebar");
    expect(names).toContain("viewer-bar");
    expect(names).toContain("dot");
    expect(names.length).toBeGreaterThan(30);
    expect(defined().size).toBeGreaterThan(40);
    expect(Object.keys(STYLESHEETS).length).toBeGreaterThan(5);
  });
});
