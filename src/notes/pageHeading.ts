/**
 * The notes' title and the line under it, as the redesign canvas draws them: "Monday plans",
 * then "Created Monday · errands, uni, gym" (2026-11-07). Drawn by the editor above the
 * first line, so it scrolls with the writing and sits in its measure, but it is not part of
 * `notes.md`: the name is the item's, kept in its manifest, and renaming it renames this.
 *
 * A page's heading (2026-11-14) has the note it lives in above its title, "↑ In 1. Raft
 * consensus", one press up a level, as the redesign canvas draws it.
 */
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

export interface PageHeading {
  readonly title: string;
  /** The line under the title; empty for none. */
  readonly meta: string;
  /** For a page, the name of the note it lives in; `null` for an item's own notes. */
  readonly up: string | null;
}

/** The line under the title: when the item was made, and its tags. */
export function headingMeta(createdAt: string, tags: readonly string[]): string {
  const made = new Date(createdAt);
  const created = Number.isNaN(made.getTime())
    ? ""
    : `Created ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(made)}`;

  return [created, tags.join(", ")].filter((part) => part !== "").join(" · ");
}

/** "↑ In <note>", the way up from a page to the note it lives in. */
function upButton(into: string, onUp: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const name = document.createElement("strong");

  button.type = "button";
  button.className = "md-page-up";
  button.title = "Go up to the note this page is in";
  arrow.setAttribute("viewBox", "0 0 16 16");
  arrow.setAttribute("aria-hidden", "true");
  shape.setAttribute("d", "M8 12.5V4M4.5 7.5 8 4l3.5 3.5");
  arrow.append(shape);
  name.textContent = into;
  button.append(arrow, "In ", name);
  // Pressed, not clicked, so the editor never moves its cursor here first; a keyboard
  // press arrives as a click with no press before it.
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    onUp();
  });
  button.addEventListener("click", (event) => {
    if (event.detail === 0) {
      onUp();
    }
  });

  return button;
}

class HeadingWidget extends WidgetType {
  constructor(
    readonly heading: PageHeading,
    readonly onUp: () => void,
  ) {
    super();
  }

  override eq(other: HeadingWidget): boolean {
    return other.heading.title === this.heading.title && other.heading.meta === this.heading.meta && other.heading.up === this.heading.up;
  }

  override ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest(".md-page-up") !== null;
  }

  override toDOM(): HTMLElement {
    const head = document.createElement("div");
    const title = document.createElement("h1");

    head.className = "md-page-head";

    if (this.heading.up !== null) {
      head.append(upButton(this.heading.up, this.onUp));
    }

    title.className = "md-page-title";
    title.textContent = this.heading.title;
    head.append(title);

    if (this.heading.meta !== "") {
      const meta = document.createElement("p");

      meta.className = "md-page-meta";
      meta.textContent = this.heading.meta;
      head.append(meta);
    }

    return head;
  }
}

/** Replaces the heading, after a rename or a change of tags. */
export const setHeading = StateEffect.define<PageHeading>();

/**
 * The heading as an editor extension, starting from `heading`. `onUp` is what pressing a
 * page's way up does.
 */
export function pageHeading(heading: PageHeading, onUp: () => void) {
  const draw = (drawn: PageHeading): DecorationSet =>
    Decoration.set([Decoration.widget({ widget: new HeadingWidget(drawn, onUp), block: true, side: -1 }).range(0)]);

  return StateField.define<DecorationSet>({
    create: () => draw(heading),
    update(current, transaction) {
      let replaced: PageHeading | null = null;

      for (const effect of transaction.effects) {
        if (effect.is(setHeading)) {
          replaced = effect.value;
        }
      }

      return replaced === null ? current.map(transaction.changes) : draw(replaced);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
