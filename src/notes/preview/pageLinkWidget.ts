/**
 * A page link drawn as the page's row in the note it lives in (2026-11-14, "Pages" row of
 * the redesign canvas): the page icon, then its name, underlined. Pressing it opens the
 * page beside the same document.
 *
 * An element, as a citation is: kept or deleted whole, never opened into its Markdown, so
 * the cursor steps over it and Backspace takes the whole link (`field.ts`).
 */
import { WidgetType } from "@codemirror/view";

const SVG = "http://www.w3.org/2000/svg";

/** The page icon, as the canvas draws it: a sheet with a turned corner and two lines. */
function pageIcon(): SVGSVGElement {
  const icon = document.createElementNS(SVG, "svg");

  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");

  for (const d of ["M4 2h5.5l3 3v9h-8.5z", "M9.5 2v3h3M6 8.5h4M6 11h3"]) {
    const shape = document.createElementNS(SVG, "path");

    shape.setAttribute("d", d);
    icon.append(shape);
  }

  return icon;
}

export class PageLinkWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly onPage: (id: string) => void,
  ) {
    super();
  }

  override eq(other: PageLinkWidget): boolean {
    return other.id === this.id && other.title === this.title;
  }

  override toDOM(): HTMLElement {
    const row = document.createElement("span");
    const open = document.createElement("button");
    const name = document.createElement("span");

    row.className = "md-page-link";
    open.type = "button";
    open.className = "md-page-link-open";
    open.dataset["page"] = this.id;
    open.title = "Open this page";
    name.className = "md-page-link-name";
    name.textContent = this.title;
    open.append(pageIcon(), name);
    // Pressed rather than clicked, so the editor never sees the press: the button goes to
    // the page; it does not put the cursor here.
    open.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onPage(this.id);
    });
    // Enter or Space on the focused button, which arrives as a click with no press before it.
    open.addEventListener("click", (event) => {
      if (event.detail === 0) {
        this.onPage(this.id);
      }
    });
    row.append(open);

    return row;
  }

  override ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest(".md-page-link-open") !== null;
  }
}
