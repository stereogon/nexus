/**
 * Find and replace in the notes (⌘F with the notes focused), in a strip at the top of the
 * notes, in the document's find bar's chrome. Enter goes to the next match and Shift-Enter to
 * the previous, as in the document's; Escape closes it and goes back to writing.
 *
 * What is found, and the edits, are `notes/findInNotes.ts`; this only draws the controls.
 */
import type { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { closeFind, replaceAll, replaceMatch, searchFor, stepFind, type NotesFind } from "../notes/findInNotes";

/** What the count says, in words. */
export function notesFindStatus(find: Pick<NotesFind, "query" | "matches" | "current">, replaced: number | null): string {
  if (replaced !== null) {
    return `Replaced ${String(replaced)}`;
  }

  if (find.query === "") {
    return "";
  }

  const total = find.matches.length;

  if (total === 0) {
    return "No matches";
  }

  return find.current === null ? `${String(total)} found` : `${String(find.current + 1)} of ${String(total)}`;
}

export function NotesFindBar({ find, view }: { readonly find: NotesFind; readonly view: RefObject<EditorView | null> }) {
  const field = useRef<HTMLInputElement | null>(null);
  const [replacement, setReplacement] = useState("");
  // How many Replace All changed, shown until the search changes.
  const [replaced, setReplaced] = useState<number | null>(null);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [find.opened]);

  const act = (run: (editor: EditorView) => void) => () => {
    if (view.current !== null) {
      run(view.current);
    }
  };
  const close = act((editor) => {
    closeFind(editor);
    editor.focus();
  });
  const replaceOne = act((editor) => {
    replaceMatch(editor, replacement);
  });
  /** Enter does `onEnter`, Shift-Enter the reverse; Escape closes; ⌘F again selects the words to find. */
  const keys = (onEnter: (back: boolean) => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onEnter(event.shiftKey);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.metaKey && event.key.toLowerCase() === "f") {
      // Not the document's ⌘F, which would take the typing away from the notes.
      event.preventDefault();
      field.current?.focus();
      field.current?.select();
    }
  };
  const none = find.matches.length === 0;

  return (
    <div aria-label="Find in notes" className="find-bar notes-find" role="search">
      <input
        aria-label="Find in notes"
        onChange={(event) => {
          setReplaced(null);
          act((editor) => {
            searchFor(editor, event.target.value);
          })();
        }}
        onKeyDown={keys((back) => {
          act((editor) => stepFind(editor, back ? -1 : 1))();
        })}
        placeholder="Find in notes"
        ref={field}
        type="search"
        value={find.query}
      />
      <span aria-live="polite" className="find-count">
        {notesFindStatus(find, replaced)}
      </span>
      <button aria-label="Previous match" className="quiet" disabled={none} onClick={act((editor) => stepFind(editor, -1))} type="button">
        ↑
      </button>
      <button aria-label="Next match" className="quiet" disabled={none} onClick={act((editor) => stepFind(editor, 1))} type="button">
        ↓
      </button>
      <input
        aria-label="Replace with"
        onChange={(event) => {
          setReplacement(event.target.value);
        }}
        onKeyDown={keys(replaceOne)}
        placeholder="Replace with"
        type="text"
        value={replacement}
      />
      <button className="quiet" disabled={none} onClick={replaceOne} type="button">
        Replace
      </button>
      <button
        className="quiet"
        disabled={none}
        onClick={act((editor) => {
          setReplaced(replaceAll(editor, replacement));
        })}
        type="button"
      >
        Replace all
      </button>
      <button aria-label="Close find" className="quiet" onClick={close} type="button">
        ✕
      </button>
    </div>
  );
}
