/**
 * Opening the chart form from inside the editor (2026-11-08): from `+`'s menu for a new
 * chart, and from a drawn chart's Edit button. Both are deep in CodeMirror, so the form's
 * opener is a facet the editor is built with, rather than a callback threaded through each
 * widget and menu.
 */
import { Facet, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { findPreviews } from "./preview/find";

/** What the form replaces: an existing ```chart block, or the empty line a new one goes on. */
export interface ChartAt {
  readonly from: number;
  readonly to: number;
  /** The block's JSON, or `null` for a new chart. */
  readonly source: string | null;
  /** The text from `from` to `to` when the form opened, to tell whether it changed since. */
  readonly original: string;
}

/** How the editor opens the chart form; none in an editor without one. */
export const chartOpener = Facet.define<(at: ChartAt) => void, ((at: ChartAt) => void) | null>({
  combine: (openers) => openers[0] ?? null,
});

/** The ```chart block at `at`, if there is one there. */
export function chartBlockAt(state: EditorState, at: number): ChartAt | null {
  const found = findPreviews(state.doc.toString()).find(
    (preview) => preview.kind === "chart" && preview.from <= at && at <= preview.to,
  );

  return found?.kind === "chart"
    ? { from: found.from, to: found.to, source: found.source, original: state.doc.sliceString(found.from, found.to) }
    : null;
}

/**
 * Writes the chart over what the form was opened on, or says why not: if the notes changed
 * underneath it, the range no longer holds what was there, and writing over it would
 * replace the wrong text.
 */
export function writeChart(view: EditorView, at: ChartAt, source: string): string | null {
  if (at.to > view.state.doc.length || view.state.doc.sliceString(at.from, at.to) !== at.original) {
    return "The notes changed while the chart was open, so it was not written. Close this and open the chart again.";
  }

  const block = `\`\`\`chart\n${source}\n\`\`\``;
  // At the end of the notes a line follows, so there is somewhere to keep writing.
  const tail = at.to === view.state.doc.length ? "\n" : "";

  view.dispatch({ changes: { from: at.from, to: at.to, insert: block + tail }, selection: { anchor: at.from + block.length + tail.length } });
  view.focus();

  return null;
}
