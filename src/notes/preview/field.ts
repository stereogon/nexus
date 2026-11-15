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
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet, type WidgetType } from "@codemirror/view";

import { ChartWidget, MermaidWidget } from "./diagrams";
import { flashLine, flashOn } from "../flash";
import { findPreviews, type Preview } from "./find";
import { markupDecorations } from "./markup";
import { noteMarkDecorations } from "./noteMarks";
import { paintDecorations } from "./paintSpans";
import { PageLinkWidget } from "./pageLinkWidget";
import { CitationWidget, ImageWidget, MathWidget, SpacedWidget } from "./widgets";

export interface PreviewContext {
  /** A citation's page button was pressed. */
  readonly onCite: (id: string) => void;
  /** The URL an image path loads from, or `null` if it is not one to load. */
  readonly imageUrl: (src: string) => string | null;
  /** A page link was pressed. */
  readonly onPage: (id: string) => void;
}

/** Whether any cursor or selection touches `from`–`to`, ends included. */
function touched(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

/** Drawn as a block of its own, replacing whole lines. */
function isBlock(preview: Preview): boolean {
  return (
    preview.kind === "citation" ||
    preview.kind === "page" ||
    preview.kind === "mermaid" ||
    preview.kind === "chart" ||
    (preview.kind === "math" && preview.display)
  );
}

/**
 * Whether a preview opens into its Markdown while the cursor is in it. A formula or a
 * diagram is written as source, so it opens to be edited; a citation, an image or a page
 * link is an element, as in Notion — kept or deleted whole, never edited (2026-11-07).
 */
function opens(preview: Preview): boolean {
  return preview.kind !== "citation" && preview.kind !== "image" && preview.kind !== "page";
}

function widgetFor(preview: Preview, context: PreviewContext, lit: string): WidgetType {
  switch (preview.kind) {
    case "citation":
      return new CitationWidget(preview.page, preview.id, preview.quote, context.onCite, lit);
    case "math":
      return new MathWidget(preview.tex, preview.display);
    case "mermaid":
      return new MermaidWidget(preview.source);
    case "chart":
      return new ChartWidget(preview.source);
    case "image":
      return new ImageWidget(preview.src, preview.alt, context.imageUrl(preview.src));
    case "page":
      return new PageLinkWidget(preview.id, preview.title, context.onPage);
  }
}

function decorations(state: EditorState, context: PreviewContext): DecorationSet {
  const found = findPreviews(state.doc.toString());
  const previews = found.filter((preview) => !opens(preview) || !touched(state, preview.from, preview.to));
  // A diagram or chart being written is drawn below its code as it is typed (2026-11-08),
  // rather than only once the cursor has left it.
  const live = found
    .filter((preview) => (preview.kind === "mermaid" || preview.kind === "chart") && touched(state, preview.from, preview.to))
    .map((preview) =>
      Decoration.widget({ widget: new SpacedWidget(widgetFor(preview, context, "")), block: true, side: 1 }).range(preview.to),
    );
  const claimed = (from: number, to: number) =>
    previews.some((preview) => preview.from <= from && to <= preview.to);
  const markup = markupDecorations(state, claimed);
  const flash = flashOn(state);
  const litAt = (from: number) => (flash !== null && state.doc.lineAt(from).from === flash.at ? flash.cls : "");
  const tables = markup.tables;

  // A rendered table replaces its lines whole, so a formula or image inside one is drawn
  // as part of the table's text rather than as a second replacement over the same range.
  const outside = previews.filter(
    (preview) => !tables.some((table) => table.from <= preview.from && preview.to <= table.to),
  );

  return Decoration.set(
    [
      ...outside.map((preview) =>
        Decoration.replace({
          widget: isBlock(preview)
            ? new SpacedWidget(widgetFor(preview, context, litAt(preview.from)))
            : widgetFor(preview, context, litAt(preview.from)),
          block: isBlock(preview),
        }).range(
          preview.from,
          preview.to,
        ),
      ),
      ...live,
      ...markup.decorations,
      ...noteMarkDecorations(state, claimed),
      ...paintDecorations(state, claimed),
    ],
    true,
  );
}

export function livePreview(context: PreviewContext): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => decorations(state, context),
    // Also when the parser catches up: it parses in the background, and the markup is read
    // from its tree.
    update: (current, transaction) =>
      transaction.docChanged ||
      transaction.selection !== undefined ||
      transaction.effects.some((effect) => effect.is(flashLine)) ||
      syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
        ? decorations(transaction.state, context)
        : current,
    provide: (field) => [
      EditorView.decorations.from(field),
      // What is hidden or drawn in place of the text is stepped over whole, so the cursor
      // never stands inside a hidden `**` or a citation. Only replacements: a mark (bold,
      // a highlight) is ordinary text the cursor moves through.
      EditorView.atomicRanges.of((view) => {
        const atomic = new RangeSetBuilder<Decoration>();

        const at = view.state.field(field).iter();

        while (at.value !== null) {
          if (at.value.point && at.from < at.to) {
            atomic.add(at.from, at.to, at.value);
          }

          at.next();
        }

        return atomic.finish();
      }),
    ],
  });
}
