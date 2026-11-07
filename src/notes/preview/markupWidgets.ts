/**
 * What the live preview draws in place of Markdown: a list's bullet, a to-do's box, a code
 * block's language, a rule. Apart from `markup.ts`, which decides where each goes.
 */
import { WidgetType, type EditorView } from "@codemirror/view";

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

/** The language of a code block, as a quiet label in its top corner. */
export class LanguageWidget extends WidgetType {
  constructor(readonly language: string) {
    super();
  }

  override eq(other: LanguageWidget): boolean {
    return other.language === this.language;
  }

  override toDOM(): HTMLElement {
    const label = document.createElement("span");

    label.className = "md-code-lang";
    label.textContent = this.language;

    return label;
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
