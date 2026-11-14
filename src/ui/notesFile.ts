/**
 * Which file the notes pane is editing — an item's `notes.md`, or one of its pages — and
 * reading and writing it. Split from `useNotes` (2026-11-14), when pages made the file a
 * choice and leaving one file for another had to save to the file left.
 */
import { loadNotes, saveNotes, type Notes, type NotesSave } from "../ipc/notes";
import { loadPage, savePage } from "../ipc/pages";
import { asCommandError, type CommandError } from "../ipc/vault";
import { noteError } from "./errorLog";

/** Which file: an item's notes, or the page `page` inside them. */
export interface NotesFile {
  readonly vault: string;
  readonly directory: string;
  readonly page: string | null;
}

/** Reads the item's notes, or the page `page` inside them. */
export function load(vault: string, directory: string, page: string | null): Promise<Notes> {
  return page === null ? loadNotes(vault, directory) : loadPage(vault, directory, page);
}

export function write(file: NotesFile, text: string, basedOn: string): Promise<NotesSave> {
  return file.page === null
    ? saveNotes(file.vault, file.directory, text, basedOn)
    : savePage(file.vault, file.directory, file.page, text, basedOn);
}

/** Said in the error panel when the last words in a file left could not be saved. */
const LEFT_UNSAVED: CommandError = {
  code: "ERR_NOTES_LEFT_UNSAVED",
  remediation:
    "The last words typed before a note was closed were not saved, because the note had changed on another device or in another app. Open it again to see what it holds.",
};

/**
 * Saves `text` to `file` as it is left, after the save in flight if there is one. Nothing
 * on screen shows `file` any more, so what goes wrong is said in the error panel.
 */
export function keepOnLeaving(file: NotesFile, text: string, version: string | null, inFlight: Promise<string | null> | null): void {
  const send = (basedOn: string | null) => {
    if (basedOn === null) {
      noteError(LEFT_UNSAVED);
      return;
    }

    write(file, text, basedOn).then(
      (outcome) => {
        if (outcome.outcome === "conflict") {
          noteError(LEFT_UNSAVED);
        }
      },
      (thrown: unknown) => {
        noteError(asCommandError(thrown));
      },
    );
  };

  // At once when nothing is in flight, so closing the window straight after still sends it.
  if (inFlight === null) {
    send(version);
  } else {
    void inFlight.then(send);
  }
}
