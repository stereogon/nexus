/**
 * What a citation, a formula and an image look like once rendered in the notes.
 *
 * Each is a CodeMirror widget drawn in place of its source while the cursor is elsewhere.
 * Clicking into one puts the cursor there and shows the text again, so nothing becomes
 * uneditable by being pretty. A widget that cannot render shows a sentence saying why, in
 * the same place, and never throws: §1.4 says a bad formula must keep the editor mounted
 * with the cursor and the undo history intact.
 */
import { WidgetType, type EditorView } from "@codemirror/view";
import katex from "katex";
import "katex/dist/katex.min.css";

/** A sentence under or in place of something that could not be shown. */
export function problem(text: string, inline = false): HTMLElement {
  const element = document.createElement(inline ? "span" : "div");

  element.className = "md-problem";
  element.textContent = text;

  return element;
}

/**
 * A citation line, as a card: the page it points at, then what it quotes.
 *
 * The page is a button that takes the document there. Everything else in the card is left
 * to the editor, so clicking the quote puts the cursor in the line and shows its Markdown.
 */
export class CitationWidget extends WidgetType {
  constructor(
    readonly page: number,
    readonly id: string,
    readonly quote: string | null,
    readonly onCite: (id: string) => void,
    /** The flash class while the notes are being taken to this citation, or empty. */
    readonly lit: string = "",
  ) {
    super();
  }

  override eq(other: CitationWidget): boolean {
    return other.page === this.page && other.id === this.id && other.quote === this.quote && other.lit === this.lit;
  }

  override toDOM(view: EditorView): HTMLElement {
    const card = document.createElement("span");
    const jump = document.createElement("button");

    card.className = this.lit === "" ? "md-citation" : `md-citation ${this.lit}`;
    jump.className = "md-citation-page";
    jump.type = "button";
    jump.dataset["cite"] = this.id;
    jump.title = "Show in the document";
    // A pin before the page, as the canvas draws it, in the page's own colour.
    const pin = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");

    pin.setAttribute("viewBox", "0 0 12 12");
    pin.setAttribute("aria-hidden", "true");
    shape.setAttribute("d", "M6 1.5v6M3.5 4.5h5M6 7.5 4.5 10.5h3z");
    pin.append(shape);
    jump.append(pin, `Page ${String(this.page)}`);
    // Pressed rather than clicked, so the editor never sees the press and the cursor stays
    // where it was: the button goes somewhere else; it does not edit.
    jump.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onCite(this.id);
    });
    card.append(jump);

    // A citation is an element, kept or deleted whole (2026-11-07): this removes its line.
    const remove = document.createElement("button");

    remove.className = "md-citation-remove";
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove citation");
    remove.title = "Remove citation";
    remove.textContent = "✕";
    remove.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const doc = view.state.doc;
      const line = doc.lineAt(view.posAtDOM(card));
      const span = line.number < doc.lines ? { from: line.from, to: line.to + 1 } : { from: Math.max(0, line.from - 1), to: line.to };

      view.dispatch({ changes: span });
      view.focus();
    });
    card.append(remove);

    if (this.quote !== null) {
      const quote = document.createElement("span");

      quote.className = "md-citation-quote";
      quote.textContent = `“${this.quote}”`;
      card.append(quote);
    }

    return card;
  }

  override ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest(".md-citation-page, .md-citation-remove") !== null;
  }
}

/** A formula, typeset by KaTeX, inline or as a display block. */
export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }

  override eq(other: MathWidget): boolean {
    return other.tex === this.tex && other.display === this.display;
  }

  override toDOM(): HTMLElement {
    const host = document.createElement(this.display ? "div" : "span");

    host.className = this.display ? "md-math md-math-display" : "md-math";

    try {
      katex.render(this.tex, host, { displayMode: this.display, throwOnError: true, strict: "ignore" });
    } catch (thrown: unknown) {
      const reason = thrown instanceof Error ? thrown.message.replace(/^KaTeX parse error: /, "") : "it could not be read";

      return problem(`This formula could not be typeset: ${reason}. Click it to edit.`, !this.display);
    }

    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Why an image path is not shown, said for the kind of path it is.
 *
 * Every case ends with what to do: paste the picture, which keeps a copy in the lecture.
 * A web address and a path elsewhere on disk are not loaded on purpose, so the sentence
 * says that rather than leaving a blank where the picture would be.
 */
export function unshownImage(src: string): string {
  const fix = "Paste the picture into the notes to keep a copy with them.";

  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) {
    return `Only images in these notes' assets folder are shown, and “${src}” is on the web — Nexus never fetches anything. ${fix}`;
  }

  return `Only images in these notes' assets folder are shown, and “${src}” is not in it. ${fix}`;
}

/**
 * An image from the lecture's own `assets/` folder.
 *
 * Only that folder. A path outside it, or a web address, is shown as a sentence rather
 * than loaded: the app is offline by definition, and a note must never be a way to make it
 * fetch something or read a file outside the lecture.
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly url: string | null,
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt && other.url === this.url;
  }

  override toDOM(view: EditorView): HTMLElement {
    if (this.url === null) {
      return problem(unshownImage(this.src), true);
    }

    const image = document.createElement("img");

    image.className = "md-image";
    image.alt = this.alt;
    image.src = this.url;
    image.addEventListener("load", () => {
      view.requestMeasure();
    });
    image.addEventListener("error", () => {
      image.replaceWith(problem(`The image “${this.src}” is not in these notes' assets folder any more.`, true));
    });

    return image;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/**
 * A block widget with room above and below it, as Notion spaces its elements (2026-11-07).
 * The room is padding on a box of its own: the editor measures a block widget's own box to
 * place the lines after it, and a margin outside it — as each card here used to have — put
 * the line under the pointer a little further off with every block above it, until the
 * handle's + appeared beside the wrong line (reported from a screenshot, 2026-11-07).
 */
export class SpacedWidget extends WidgetType {
  constructor(readonly inner: WidgetType) {
    super();
  }

  override eq(other: SpacedWidget): boolean {
    return other instanceof SpacedWidget && this.inner.constructor === other.inner.constructor && this.inner.eq(other.inner);
  }

  override toDOM(view: EditorView): HTMLElement {
    const block = document.createElement("div");

    block.className = "md-block";
    block.append(this.inner.toDOM(view));

    return block;
  }

  override ignoreEvent(event: Event): boolean {
    return this.inner.ignoreEvent(event);
  }

  /** Lets what it wraps redraw in place — an edited table keeps its focus that way. */
  override updateDOM(dom: HTMLElement, view: EditorView, from: SpacedWidget): boolean {
    const inner = dom.firstElementChild;

    // Only between two of the same kind: a table cannot redraw a formula's element.
    return inner instanceof HTMLElement && from.inner.constructor === this.inner.constructor && this.inner.updateDOM(inner, view, from.inner);
  }

  override destroy(dom: HTMLElement): void {
    const inner = dom.firstElementChild;

    if (inner instanceof HTMLElement) {
      this.inner.destroy(inner);
    }
  }
}
