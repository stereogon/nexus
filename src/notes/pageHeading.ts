/**
 * The notes' title and the line under it, as the redesign canvas draws them: "Monday plans",
 * then "Created Monday · errands, uni, gym" (2026-11-07). Drawn by the editor above the
 * first line, so it scrolls with the writing and sits in its measure, but it is not part of
 * `notes.md`: the name is the item's, kept in its manifest, and renaming it renames this.
 */
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

export interface PageHeading {
  readonly title: string;
  /** The line under the title; empty for none. */
  readonly meta: string;
}

/** The line under the title: when the item was made, and its tags. */
export function headingMeta(createdAt: string, tags: readonly string[]): string {
  const made = new Date(createdAt);
  const created = Number.isNaN(made.getTime())
    ? ""
    : `Created ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(made)}`;

  return [created, tags.join(", ")].filter((part) => part !== "").join(" · ");
}

class HeadingWidget extends WidgetType {
  constructor(readonly heading: PageHeading) {
    super();
  }

  override eq(other: HeadingWidget): boolean {
    return other.heading.title === this.heading.title && other.heading.meta === this.heading.meta;
  }

  override toDOM(): HTMLElement {
    const head = document.createElement("div");
    const title = document.createElement("h1");

    head.className = "md-page-head";
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

const draw = (heading: PageHeading): DecorationSet =>
  Decoration.set([Decoration.widget({ widget: new HeadingWidget(heading), block: true, side: -1 }).range(0)]);

/** The heading as an editor extension, starting from `heading`. */
export function pageHeading(heading: PageHeading) {
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
