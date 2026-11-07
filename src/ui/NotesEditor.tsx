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
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { barFor, formatKeys, formatStateOf } from "../notes/markSelection";
import type { FormatState } from "./NotesFormatBar";
import { BlockHandles } from "./BlockHandles";
import { HeadingRail } from "./HeadingRail";
import { NotesFormatting } from "./NotesFormatting";
import type { MenuAt } from "./menuPlacement";

import { citationOffsets, citeLinks, nextOccurrence } from "../notes/citeLinks";
import { codeLanguages } from "../notes/codeLanguages";
import { flashLine, lineFlash } from "../notes/flash";
import { citationAt } from "../notes/insert";
import { livePreview } from "../notes/preview/field";
import { pageHeading, setHeading, type PageHeading } from "../notes/pageHeading";
import { pasteImages } from "../notes/pasteImage";
import { notePage, notesAppearance } from "../notes/theme";
import type { Point } from "./notesDrop";

/** What the pane can ask of the editor. */
export interface NotesHandle {
  /** Inserts a citation at the cursor, as a block of its own, and focuses the editor. */
  readonly insertCitation: (block: string) => void;
  /** Scrolls to a line, counting from 1, and puts the cursor at its start. */
  readonly showLine: (line: number) => void;
  /** Links images where they were dropped — `at` in window CSS pixels — or at the cursor. */
  readonly insertImages: (paths: readonly string[], at: Point) => void;
}

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
        extensions: [
          history(),
          keymap.of([
            ...formatKeys,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          // GitHub-flavoured: tables, strikethrough and task lists, which plain CommonMark
          // does not have. Without it a table was not even recognised (2026-11-05).
          markdown({ base: markdownLanguage, codeLanguages }),
          EditorView.lineWrapping,
          notesAppearance,
          page ? notePage : [],
          pageHeading(titled.current),
          lineFlash,
          livePreview({
            onCite: (id) => {
              cited.current(id);
            },
            imageUrl: (src) => images.current(src),
          }),
          placeholder("Start writing. Beside a document, select text in it and choose “Link to notes” to cite it here."),
          citeLinks((id) => {
            cited.current(id);
          }),
          pasteImages(() => pasted.current),
          EditorView.updateListener.of((update) => {
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
          }),
        ],
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

  useImperativeHandle(
    handle,
    () => ({
      insertCitation: (block: string) => {
        const editor = view.current;

        if (editor === null) {
          return;
        }

        const at = editor.state.selection.main.head;
        const { text: inserted, cursor } = citationAt(editor.state.doc.toString(), at, block);

        editor.dispatch({
          changes: { from: at, insert: inserted },
          selection: { anchor: at + cursor },
          scrollIntoView: true,
        });
        editor.focus();
      },
      insertImages: (paths: readonly string[], at: Point) => {
        const editor = view.current;

        if (editor === null || paths.length === 0) {
          return;
        }

        const from = editor.posAtCoords(at) ?? editor.state.selection.main.head;
        // On lines of their own, with the cursor below: an image is drawn only while the
        // cursor is off its line, and a drop should show the picture, not its Markdown.
        const breakBefore = from > editor.state.doc.lineAt(from).from ? "\n" : "";
        const insert = `${breakBefore}${paths.map((path) => `![](${path})`).join("\n")}\n`;

        editor.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true });
        editor.focus();
      },
      showLine: (line: number) => {
        const editor = view.current;

        if (editor === null || line < 1 || line > editor.state.doc.lines) {
          return;
        }

        const start = editor.state.doc.line(line).from;

        editor.dispatch({
          selection: { anchor: start },
          effects: EditorView.scrollIntoView(start, { y: "center" }),
        });
        editor.focus();
      },
    }),
    [],
  );

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
    </>
  );
}
