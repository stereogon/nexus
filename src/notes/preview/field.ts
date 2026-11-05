/**
 * The live preview: each construct `find.ts` finds is drawn in place of its source while
 * the cursor is elsewhere, and shown as text again the moment the cursor enters it.
 *
 * A state field rather than a view plugin, because diagrams, charts and display maths
 * replace whole lines, and CodeMirror only accepts block-level replacements from state.
 * The scan is redone on each change; a lecture's notes are kilobytes, and widgets compare
 * by content (`eq`), so an unchanged diagram is not redrawn because the text above it
 * changed.
 */
import { StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet, type WidgetType } from "@codemirror/view";

import { ChartWidget, MermaidWidget } from "./diagrams";
import { findPreviews, type Preview } from "./find";
import { CitationWidget, ImageWidget, MathWidget } from "./widgets";

export interface PreviewContext {
  /** A citation's page button was pressed. */
  readonly onCite: (id: string) => void;
  /** The URL an image path loads from, or `null` if it is not one to load. */
  readonly imageUrl: (src: string) => string | null;
}

/** Whether any cursor or selection touches `from`–`to`, ends included. */
function touched(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

/** Drawn as a block of its own, replacing whole lines. */
function isBlock(preview: Preview): boolean {
  return preview.kind === "mermaid" || preview.kind === "chart" || (preview.kind === "math" && preview.display);
}

function widgetFor(preview: Preview, context: PreviewContext): WidgetType {
  switch (preview.kind) {
    case "citation":
      return new CitationWidget(preview.page, preview.id, preview.quote, context.onCite);
    case "math":
      return new MathWidget(preview.tex, preview.display);
    case "mermaid":
      return new MermaidWidget(preview.source);
    case "chart":
      return new ChartWidget(preview.source);
    case "image":
      return new ImageWidget(preview.src, preview.alt, context.imageUrl(preview.src));
  }
}

function decorations(state: EditorState, context: PreviewContext): DecorationSet {
  const ranges = findPreviews(state.doc.toString())
    .filter((preview) => !touched(state, preview.from, preview.to))
    .map((preview) =>
      Decoration.replace({ widget: widgetFor(preview, context), block: isBlock(preview) }).range(
        preview.from,
        preview.to,
      ),
    );

  return Decoration.set(ranges, true);
}

export function livePreview(context: PreviewContext): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => decorations(state, context),
    update: (current, transaction) =>
      transaction.docChanged || transaction.selection !== undefined
        ? decorations(transaction.state, context)
        : current,
    provide: (field) => EditorView.decorations.from(field),
  });
}
