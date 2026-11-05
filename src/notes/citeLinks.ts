/**
 * `cite://<id>` drawn as a badge inside the notes, and what a click on one does.
 *
 * The text is left exactly as typed — this is a decoration over it, not a replacement —
 * so `notes.md` holds the link and the badge is only how it looks in the editor. A click
 * jumps the document to the highlight (`claude-spec.md` §2.4) and does *not* swallow the
 * click, so the cursor still lands there and the link stays editable.
 *
 * The id pattern is the Rust scanner's (`is_id_byte`: ASCII letters, digits, `-`, `_`),
 * so the editor never badges something the citation index would not recognise.
 */
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

/** A citation, with its id captured. Global, for scanning a whole visible range. */
export const CITE_PATTERN = /cite:\/\/([A-Za-z0-9_-]+)/g;

/** The ids cited in `text`, in order, repeats included. */
export function citedIds(text: string): string[] {
  return [...text.matchAll(CITE_PATTERN)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

/**
 * Where `cite://<id>` appears in `text`, as offsets, in order.
 *
 * Only whole ids: `cite://hl-1` is not an occurrence of `hl-1` inside `cite://hl-10`.
 */
export function citationOffsets(text: string, id: string): number[] {
  return [...text.matchAll(CITE_PATTERN)].flatMap((match) => (match[1] === id ? [match.index] : []));
}

/**
 * The occurrence to show next: the first after `after`, wrapping to the first.
 *
 * So pressing "show in notes" again on a highlight cited three times walks through all
 * three rather than returning to the first each time.
 */
export function nextOccurrence(offsets: readonly number[], after: number | null): number | null {
  if (offsets.length === 0) {
    return null;
  }

  return offsets.find((offset) => after !== null && offset > after) ?? offsets[0] ?? null;
}

function decorate(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);

    for (const match of text.matchAll(CITE_PATTERN)) {
      const id = match[1];

      if (id !== undefined) {
        const start = from + match.index;

        builder.add(
          start,
          start + match[0].length,
          Decoration.mark({ class: "cm-cite", attributes: { "data-cite": id, title: "Show in the document" } }),
        );
      }
    }
  }

  return builder.finish();
}

/** The badges, and the click that follows one. */
export function citeLinks(onCite: (id: string) => void) {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = decorate(view);
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.viewportChanged) {
            this.decorations = decorate(update.view);
          }
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    EditorView.domEventHandlers({
      click(event) {
        const target = event.target;
        const badge = target instanceof Element ? target.closest("[data-cite]") : null;
        const id = badge?.getAttribute("data-cite");

        if (id !== null && id !== undefined) {
          onCite(id);
        }

        // Not handled: the cursor still moves, so the link can be edited.
        return false;
      },
    }),
  ];
}
