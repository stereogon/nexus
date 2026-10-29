/**
 * The scroll chain holds together.
 *
 * The fifth static check on the stylesheets, and the one with the longest-lived bug behind
 * it. `.app` declared `min-height: 100vh`, so the app grew to its content; a child's
 * `overflow: auto` can only scroll inside a box with a bounded height, so the viewer bed
 * grew to the whole document and the *window* scrolled instead — title bar, sidebar and
 * all. Page mode hid it entirely, because one page is about one screen tall.
 *
 * Nothing we run can see a layout: jsdom has no engine, and these are the rules that
 * decide one. What *is* checkable is the shape of the declarations, and both halves of
 * this bug are visible there.
 */
import { describe, expect, it } from "vitest";

const STYLESHEETS = import.meta.glob<string>("./styles/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

interface Rule {
  readonly file: string;
  readonly selector: string;
  readonly body: string;
}

/** Every innermost rule block, with its selector. Nested at-rules fall out as their own. */
function rules(): readonly Rule[] {
  const found: Rule[] = [];

  for (const [path, css] of Object.entries(STYLESHEETS)) {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, " ");

    for (const [, selector, body] of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selector !== undefined && body !== undefined) {
        found.push({
          file: path.replace("./styles/", ""),
          selector: selector.trim().replace(/\s+/g, " "),
          body,
        });
      }
    }
  }

  return found;
}

function declares(body: string, property: string): boolean {
  return new RegExp(`(^|;|\\s)${property}\\s*:`).test(body);
}

describe("the element that fills the window", () => {
  it("is bounded by the window rather than by its content", () => {
    const app = rules().filter((rule) => rule.selector === ".app");

    expect(app).not.toHaveLength(0);

    for (const rule of app) {
      // The whole bug in one assertion: a minimum is not a bound, and every scroll region
      // inside depends on this one being a real height.
      expect(declares(rule.body, "height")).toBe(true);
      expect(/min-height:\s*100vh/.test(rule.body)).toBe(false);
    }
  });
});

describe("a flex child that scrolls", () => {
  it("also says it may shrink below its content", () => {
    // Flex items default to `min-height: auto`, which means "at least as tall as my
    // content" -- so a scroll region that forgets this grows instead of scrolling, and
    // pushes the overflow onto whatever is outside it. The same rule in a row container
    // is `min-width: 0`, so either satisfies this.
    const scrollers = rules().filter(
      (rule) =>
        declares(rule.body, "flex") &&
        /overflow(-[xy])?\s*:\s*(auto|scroll)/.test(rule.body),
    );

    expect(scrollers).not.toHaveLength(0);

    const unshrinkable = scrollers.filter(
      (rule) => !declares(rule.body, "min-height") && !declares(rule.body, "min-width"),
    );

    expect(unshrinkable.map((rule) => `${rule.file} ${rule.selector}`)).toEqual([]);
  });
});
