/**
 * The Markdown editor, built on CodeMirror 6.
 *
 * CodeMirror edits the text itself, so `notes.md` on disk is exactly what was typed: no
 * document model to translate through, nothing reformatted on the way back. Undo history,
 * line wrapping and Markdown highlighting are its own; `cite://` badges are `citeLinks`.
 *
 * The view is built once per `generation` and owns its text from then on. React does not
 * push the text back in on every keystroke — that is the classic way to lose a cursor and
 * an undo stack, and §1.4 calls losing someone's typing the worst bug this app can have.
 * The text is only replaced wholesale when the parent says the notes changed underneath:
 * a different lecture, or "use theirs" after a conflict.
 */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState, type Ref } from "react";

import { barFor, formatStateOf } from "../notes/markSelection";
import { notesExtensions } from "./notesExtensions";
import type { FormatState } from "./NotesFormatBar";
import { BlockHandles } from "./BlockHandles";
import { HeadingRail } from "./HeadingRail";
import { ChartForm } from "./ChartForm";
import { TablePicker } from "./TablePicker";
import { NotesFormatting } from "./NotesFormatting";
import { useNotesHandle, type NotesHandle } from "./useNotesHandle";
import type { MenuAt } from "./menuPlacement";

import { citationOffsets, nextOccurrence } from "../notes/citeLinks";
import { flashLine } from "../notes/flash";
import { writeChart, type ChartAt } from "../notes/chartEditing";
import { insertTable, type TableLine } from "../notes/tableInsert";
import { setHeading, type PageHeading } from "../notes/pageHeading";

export type { NotesHandle };

export function NotesEditor({
  text,
  generation,
  onChange,
  onCite,
  handle,
  onReady,
  imageUrl,
  onPasteImage,
  reveal,
  formatting,
  page,
  heading,
}: {
  /** The text to start from, taken afresh only when `generation` changes. */
  readonly text: string;
  readonly generation: number;
  readonly onChange: (text: string) => void;
  readonly onCite: (id: string) => void;
  readonly handle: Ref<NotesHandle>;
  /** Called once the view exists, so citations made before it loaded can go in. */
  readonly onReady: () => void;
  /** Where an image path in the notes loads from, or `null` if it is not one to load. */
  readonly imageUrl: (src: string) => string | null;
  /** Keeps a pasted image; resolves to the path to insert, or `null` if it was not kept. */
  readonly onPasteImage: (file: File) => Promise<string | null>;
  /**
   * A highlight to show the citation of, from its indicator in the document. A new object
   * each time, so pressing the indicator again moves on to the next citation.
   */
  readonly reveal: { readonly id: string; readonly nonce: number } | null;
  /** The format controls are docked open, so they are there before anything is written. */
  readonly formatting: boolean;
  /** A plain note's whole page, rather than notes beside a document. Fixed for a mount. */
  readonly page: boolean;
  /** The title and the line under it, drawn above the first line (`pageHeading`). */
  readonly heading: PageHeading;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  // The text as it now is, for the heading rail, and whether the view exists yet: the
  // overlays' effects run before this component's, so they wait on this rather than
  // finding no editor once and never looking again.
  const [current, setCurrent] = useState(text);
  const [viewReady, setViewReady] = useState(false);
  const view = useRef<EditorView | null>(null);
  // What the selection or cursor has, and where a floating bar goes for a selection; `null`
  // until the editor has reported once.
  const [format, setFormat] = useState<{
    readonly at: MenuAt | null;
    readonly state: FormatState;
    readonly selected: boolean;
  } | null>(null);

  // The latest callbacks, read by the view's listeners. Rebuilding the view to pick up a
  // new callback would throw away the cursor and the undo history.
  // The chart form, open on a block or a new chart's line, and why its last save failed.
  const [chart, setChart] = useState<{ readonly at: ChartAt; readonly failure: string | null } | null>(null);
  // The table picker, open for a new table's line.
  const [tableLine, setTableLine] = useState<TableLine | null>(null);
  const changed = useRef(onChange);
  const cited = useRef(onCite);
  const ready = useRef(onReady);
  const images = useRef(imageUrl);
  const pasted = useRef(onPasteImage);
  images.current = imageUrl;
  pasted.current = onPasteImage;
  changed.current = onChange;
  cited.current = onCite;
  ready.current = onReady;

  // Read once per generation: a new value of `text` alone must not rebuild the view.
  const starting = useRef(text);
  starting.current = text;
  const titled = useRef(heading);
  titled.current = heading;

  useEffect(() => {
    const parent = host.current;

    if (parent === null) {
      return undefined;
    }

    const built = new EditorView({
      parent,
      state: EditorState.create({
        doc: starting.current,
        extensions: notesExtensions({
          page,
          heading: titled.current,
          onCite: (id) => {
            cited.current(id);
          },
          imageUrl: (src) => images.current(src),
          keepImage: () => pasted.current,
          onChart: (at) => {
            setChart({ at, failure: null });
          },
          onTable: setTableLine,
          onUpdate: (update) => {
            if (update.docChanged) {
              changed.current(update.state.doc.toString());
              setCurrent(update.state.doc.toString());
            }

            if (update.selectionSet || update.focusChanged || update.docChanged) {
              setFormat({
                at: barFor(update.view),
                state: formatStateOf(update.view),
                selected: !update.state.selection.main.empty,
              });
            }
          },
        }),
      }),
    });

    view.current = built;
    setCurrent(built.state.doc.toString());
    // Known from the start, so formatting docked open is there before anything is typed.
    setFormat({ at: null, state: formatStateOf(built), selected: false });
    setViewReady(true);
    ready.current();

    return () => {
      built.destroy();
      view.current = null;
      setViewReady(false);
    };
  }, [generation]);

  // A rename or new tags redraw the heading in place, keeping the cursor and the history.
  useEffect(() => {
    view.current?.dispatch({ effects: setHeading.of({ title: heading.title, meta: heading.meta }) });
  }, [heading.title, heading.meta]);

  // Where each highlight's citation was last shown, so the next press moves on from it.
  const shown = useRef(new Map<string, number>());

  useEffect(() => {
    const editor = view.current;

    if (reveal === null || editor === null) {
      return;
    }

    const offsets = citationOffsets(editor.state.doc.toString(), reveal.id);
    const at = nextOccurrence(offsets, shown.current.get(reveal.id) ?? null);

    if (at === null) {
      return;
    }

    shown.current.set(reveal.id, at);
    // Scrolled to and flashed, but the selection is left alone: a cursor on the line would
    // turn a rendered citation back into its Markdown, which is not what "show me" means.
    editor.dispatch({ effects: [EditorView.scrollIntoView(at, { y: "center" }), flashLine.of(at)] });
  }, [reveal]);

  useNotesHandle(handle, view);

  return (
    <>
      {/* First, so docked formatting sits under the header, as the canvas draws it. */}
      {format !== null && (
        <NotesFormatting
          at={format.at}
          docked={formatting}
          onDismiss={() => {
            setFormat((current) => (current === null ? null : { ...current, at: null }));
          }}
          selected={format.selected}
          state={format.state}
          view={view}
        />
      )}
      <div className="notes-body" ref={body}>
        <div className="notes-editor" ref={host} />
        {viewReady && <BlockHandles box={body} text={current} view={view} />}
        {viewReady && <HeadingRail text={current} view={view} />}
      </div>
      {chart !== null && (
        <ChartForm
          failure={chart.failure}
          onClose={() => {
            setChart(null);
            view.current?.focus();
          }}
          onSave={(source) => {
            const failure = view.current === null ? "The notes are not open." : writeChart(view.current, chart.at, source);

            setChart(failure === null ? null : { ...chart, failure });
          }}
          source={chart.at.source}
        />
      )}
      {tableLine !== null && (
        <TablePicker
          onClose={() => {
            setTableLine(null);
            view.current?.focus();
          }}
          onPick={(rows, columns) => {
            setTableLine(null);

            if (view.current !== null) {
              insertTable(view.current, tableLine, rows, columns);
            }
          }}
        />
      )}
    </>
  );
}
