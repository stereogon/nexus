/**
 * What the notes pane can ask of the editor: insert a citation or images, show a line.
 * Moved out of `NotesEditor` on 2026-11-08, unchanged, to keep that file to its job of
 * building and hosting the view.
 */
import { EditorView } from "@codemirror/view";
import { useImperativeHandle, type Ref, type RefObject } from "react";

import { citationAt } from "../notes/insert";
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

export function useNotesHandle(handle: Ref<NotesHandle>, view: RefObject<EditorView | null>): void {
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
}
