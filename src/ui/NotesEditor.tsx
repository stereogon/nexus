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
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

import { citeLinks } from "../notes/citeLinks";
import { citationAt } from "../notes/insert";
import { livePreview } from "../notes/preview/field";
import { notesAppearance } from "../notes/theme";

/** What the pane can ask of the editor. */
export interface NotesHandle {
  /** Inserts a citation at the cursor, as a block of its own, and focuses the editor. */
  readonly insertCitation: (block: string) => void;
  /** Scrolls to a line, counting from 1, and puts the cursor at its start. */
  readonly showLine: (line: number) => void;
}

export function NotesEditor({
  text,
  generation,
  onChange,
  onCite,
  handle,
  onReady,
  imageUrl,
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
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);

  // The latest callbacks, read by the view's listeners. Rebuilding the view to pick up a
  // new callback would throw away the cursor and the undo history.
  const changed = useRef(onChange);
  const cited = useRef(onCite);
  const ready = useRef(onReady);
  const images = useRef(imageUrl);
  images.current = imageUrl;
  changed.current = onChange;
  cited.current = onCite;
  ready.current = onReady;

  // Read once per generation: a new value of `text` alone must not rebuild the view.
  const starting = useRef(text);
  starting.current = text;

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
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          notesAppearance,
          livePreview({
            onCite: (id) => {
              cited.current(id);
            },
            imageUrl: (src) => images.current(src),
          }),
          placeholder("Notes for this lecture. Select text in the document and choose “Link to notes” to cite it here."),
          citeLinks((id) => {
            cited.current(id);
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              changed.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    view.current = built;
    ready.current();

    return () => {
      built.destroy();
      view.current = null;
    };
  }, [generation]);

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

  return <div className="notes-editor" ref={host} />;
}
