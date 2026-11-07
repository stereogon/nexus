/**
 * What the live preview draws in place of Markdown: a list's bullet, a to-do's box, a code
 * block's language, a rule. Apart from `markup.ts`, which decides where each goes.
 */
import { WidgetType, type EditorView } from "@codemirror/view";

import { blockAt } from "../blocks";
import { CODE_CHOICES, choiceFor } from "../codeLanguages";

export class BulletWidget extends WidgetType {
  constructor(readonly depth: number) {
    super();
  }

  override eq(other: BulletWidget): boolean {
    return other.depth === this.depth;
  }

  override toDOM(): HTMLElement {
    const bullet = document.createElement("span");

    bullet.className = "md-bullet";
    bullet.textContent = ["•", "◦", "▪"][this.depth % 3] ?? "•";

    return bullet;
  }
}

/** A task's box. Clicking it toggles `[ ]` and `[x]` in the text itself. */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly at: number,
  ) {
    super();
  }

  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.at === this.at;
  }

  override toDOM(view: EditorView): HTMLElement {
    // A drawn box rather than the system checkbox, so its tick can take each theme's
    // on-accent colour (a white tick vanishes on a light accent such as Ink's pink).
    const box = document.createElement("span");

    box.className = "md-checkbox";
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.setAttribute("aria-label", this.checked ? "Done" : "Not done");

    if (this.checked) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const tick = document.createElementNS("http://www.w3.org/2000/svg", "path");

      svg.setAttribute("viewBox", "0 0 12 12");
      svg.setAttribute("aria-hidden", "true");
      tick.setAttribute("d", "M2.5 6.3 5 8.7 9.6 3.6");
      svg.append(tick);
      box.append(svg);
    }

    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ changes: { from: this.at, to: this.at + 3, insert: this.checked ? "[ ]" : "[x]" } });
    });

    return box;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/**
 * A code block's header, as Notion has it (2026-11-07): a menu of languages — choosing one
 * rewrites the fence's tag, and the colouring follows — and Copy, which takes the code
 * without its fences.
 */
export class CodeHeaderWidget extends WidgetType {
  constructor(
    readonly tag: string,
    /** Where the opening fence starts. */
    readonly at: number,
  ) {
    super();
  }

  override eq(other: CodeHeaderWidget): boolean {
    return other.tag === this.tag && other.at === this.at;
  }

  override toDOM(view: EditorView): HTMLElement {
    // A block of its own above the code, in place of the opening fence line.
    const header = document.createElement("div");
    const menu = document.createElement("select");
    const copy = document.createElement("button");
    const current = choiceFor(this.tag);
    const choices = CODE_CHOICES.some((choice) => choice.tag === current.tag) ? CODE_CHOICES : [...CODE_CHOICES, current];

    header.className = "md-code-head";
    menu.className = "md-code-lang";
    menu.setAttribute("aria-label", "Code language");

    for (const choice of choices) {
      const option = document.createElement("option");

      option.value = choice.tag;
      option.textContent = choice.label;
      option.selected = choice.tag === current.tag;
      menu.append(option);
    }

    menu.addEventListener("change", () => {
      const fence = view.state.doc.lineAt(this.at);
      const marker = /^\s*(`{3,}|~{3,})/.exec(fence.text)?.[0] ?? "```";

      view.dispatch({ changes: { from: fence.from, to: fence.to, insert: `${marker}${menu.value}` } });
      view.focus();
    });

    copy.type = "button";
    copy.className = "md-code-copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => {
      const doc = view.state.doc;
      const block = blockAt(doc.toString(), doc.lineAt(this.at).number);
      const closed = block.to > block.from && /^\s*(`{3,}|~{3,})\s*$/.test(doc.line(block.to).text);
      const lines = [];

      for (let line = block.from + 1; line <= (closed ? block.to - 1 : block.to); line += 1) {
        lines.push(doc.line(line).text);
      }

      // Said either way: a refused clipboard is shown, not left to look like a copy.
      navigator.clipboard.writeText(lines.join("\n")).then(
        () => {
          copy.textContent = "Copied";
        },
        () => {
          copy.textContent = "Couldn't copy";
        },
      );
    });

    header.append(menu, copy);

    // Room above the panel, as padding on a box of its own (see `SpacedWidget`).
    const top = document.createElement("div");

    top.className = "md-code-top";
    top.append(header);

    return top;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

export class RuleWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const rule = document.createElement("span");

    rule.className = "md-rule";

    return rule;
  }
}

/** The rounded foot of a code block, in place of its closing fence line. */
export class CodeFootWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const bottom = document.createElement("div");
    const foot = document.createElement("div");

    // Room below the panel, so what follows a code block is not drawn flush against it.
    bottom.className = "md-code-bottom";
    bottom.setAttribute("aria-hidden", "true");
    foot.className = "md-code-foot";
    bottom.append(foot);

    return bottom;
  }
}
