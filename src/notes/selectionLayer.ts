/**
 * The selection, drawn inside the writing (2026-11-09).
 *
 * `drawSelection`'s own layer runs a selection that spans lines out to the editor
 * content's outer edges, padding included, so it reached into the margin where the + and
 * ⋮⋮ sit and past the right of the measure. It looked like far more was copied than the
 * words, which was all that was (reported 2026-11-09). This layer draws CodeMirror's same
 * rectangles (`RectangleMarker.forRange`), held to the text column.
 *
 * A selection of whole lines — from a line's start to a line's end, over more than one —
 * is drawn as Notion draws selected blocks: each line its own rounded box. That is when
 * whole blocks are what is copied, so the picture says so. `drawSelection` still draws the
 * cursor; its selection layer is hidden in `theme.ts`.
 */
import type { SelectionRange } from "@codemirror/state";
import { EditorView, layer, RectangleMarker } from "@codemirror/view";

const MARK = "cm-selectionBackground";

/** The text column's left and right, in the layer's coordinates: inside the content's padding. */
function column(view: EditorView): { left: number; right: number } {
  const scroller = view.scrollDOM.getBoundingClientRect();
  const content = view.contentDOM.getBoundingClientRect();
  const style = getComputedStyle(view.contentDOM);
  const base = scroller.left - view.scrollDOM.scrollLeft * view.scaleX;

  return {
    left: content.left + parseFloat(style.paddingLeft) * view.scaleX - base,
    right: content.right - parseFloat(style.paddingRight) * view.scaleX - base,
  };
}

/** Whether `range` is whole lines, more than one: a start of a line to an end of one. */
function wholeLines(view: EditorView, range: SelectionRange): boolean {
  const first = view.state.doc.lineAt(range.from);
  const last = view.state.doc.lineAt(range.to);

  return first.number < last.number && range.from === first.from && range.to === last.to;
}

/** Each line of `range` as a box across the column, a pixel apart from the next. */
function blocks(view: EditorView, range: SelectionRange, left: number, right: number): RectangleMarker[] {
  const top = view.documentTop - (view.scrollDOM.getBoundingClientRect().top - view.scrollDOM.scrollTop * view.scaleY);
  const markers: RectangleMarker[] = [];

  for (let at = range.from; at <= range.to; ) {
    const block = view.lineBlockAt(at);

    // A line hidden by the live preview (a fence, a callout's marker) has no height to show.
    if (block.height >= 2) {
      markers.push(new RectangleMarker(`${MARK} md-block-selected`, left, top + block.top + 1, right - left, block.height - 2));
    }

    at = block.to + 1;
  }

  return markers;
}

/** CodeMirror's rectangles for `range`, cut to the column. */
function inColumn(view: EditorView, range: SelectionRange, left: number, right: number): RectangleMarker[] {
  return RectangleMarker.forRange(view, MARK, range).flatMap((marker) => {
    const from = Math.max(marker.left, left);
    const to = Math.min(marker.left + (marker.width ?? 0), right);

    return to > from ? [new RectangleMarker(MARK, from, marker.top, to - from, marker.height)] : [];
  });
}

export const selectionInColumn = layer({
  above: false,
  class: "md-selection-layer",
  markers(view) {
    const { left, right } = column(view);

    return view.state.selection.ranges
      .filter((range) => !range.empty)
      .flatMap((range) => (wholeLines(view, range) ? blocks(view, range, left, right) : inColumn(view, range, left, right)));
  },
  // Geometry changes (a pane resized) are measured again by the layer itself.
  update: (update) => update.docChanged || update.selectionSet || update.viewportChanged,
});
