/**
 * A lecture's notes in the window: loading, saving as you type, and conflicts.
 *
 * # Saving
 *
 * Saved a short pause after typing stops, rather than on every keystroke or only on a
 * button. Every keystroke would be a write per character into a synced folder; a button
 * would make "I forgot to save" a way to lose an evening's notes. The pause is a debounce
 * on input, not a timer standing in for correctness: what keeps a save correct is the
 * version check in `lecture_fs::notes_store`.
 *
 * One save is in flight at a time. Typing during a save marks the notes unsaved again, and
 * the next save goes when the current one returns, based on the version it returned — so
 * two saves can never race each other into a false conflict.
 *
 * Unsaved text is saved when the lecture changes or the pane goes away, so closing a
 * lecture mid-sentence keeps the sentence.
 *
 * # Pages
 *
 * A page (2026-11-14) is a note inside the item's notes, kept at `pages/<id>.md`. It loads
 * and saves exactly as `notes.md` does, through its own commands, so `page` only chooses
 * which file; moving to another page is a change of file like a change of lecture.
 *
 * # Conflicts
 *
 * If `notes.md` changed outside this window, the save writes nothing and this holds both
 * versions: the editor keeps the person's text, and they choose. Saving stops until they
 * do, so nothing is written over the other version by accident.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { Notes } from "../ipc/notes";
import { citedIds } from "../notes/citeLinks";
import { linkedPages } from "../notes/pageLinks";
import { asCommandError, type CommandError } from "../ipc/vault";
import { keepOnLeaving, load, write } from "./notesFile";

/** How long typing has to pause before a save. */
export const SAVE_AFTER_MS = 800;

export type SaveStatus = "loading" | "saved" | "unsaved" | "saving" | "conflict" | "failed";

export interface NotesState {
  /** The text the editor should start from, or `null` while loading or after a failure. */
  readonly loaded: Notes | null;
  /** Increases whenever the editor must take `loaded` afresh — a new lecture, or "use theirs". */
  readonly generation: number;
  readonly status: SaveStatus;
  /** What the file holds after a conflict, until the person chooses. */
  readonly onDisk: Notes | null;
  readonly failure: CommandError | null;
  /** The highlights the notes cite, so the document can show which lead somewhere. */
  readonly cited: ReadonlySet<string>;
  /** The pages the notes link to, so the Pages panel can say which are in the text. */
  readonly linked: ReadonlySet<string>;
  /** The editor's text changed. */
  readonly change: (text: string) => void;
  /** Save the editor's text over the version on disk, having seen it. */
  readonly keepMine: () => void;
  /** Replace the editor's text with the version on disk. */
  readonly takeTheirs: () => void;
}

export function useNotes(vault: string, directory: string, page: string | null = null): NotesState {
  const [loaded, setLoaded] = useState<Notes | null>(null);
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [onDisk, setOnDisk] = useState<Notes | null>(null);
  const [failure, setFailure] = useState<CommandError | null>(null);
  const [cited, setCited] = useState<ReadonlySet<string>>(new Set());
  const [linked, setLinked] = useState<ReadonlySet<string>>(new Set());

  // Replaced only when the set of ids actually changes, so typing an ordinary sentence
  // does not re-render every page of the document.
  const noteCitations = useCallback((text: string) => {
    const keep = (next: Set<string>) => (current: ReadonlySet<string>) =>
      current.size === next.size && [...next].every((id) => current.has(id)) ? current : next;

    setCited(keep(new Set(citedIds(text))));
    setLinked(keep(linkedPages(text)));
  }, []);

  // Held in refs, not state: the save loop reads the latest of each without re-rendering,
  // and a timer callback must not see the values from the render that scheduled it.
  const text = useRef("");
  const version = useRef<string | null>(null);
  const dirty = useRef(false);
  const blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The save in flight, as the version it will leave the file at (`null` if it does not
  // save), so leaving the file mid-save can follow on from it.
  const pending = useRef<Promise<string | null> | null>(null);
  // Which opening of a file this is. A save that returns after another file has opened
  // belongs to the one left, and must not touch this one's version or status.
  const opening = useRef(0);

  // Read through functions, as `PdfPage` reads its cancellation flag: typing during a
  // save sets these while the save is awaited, which TypeScript cannot see, and having
  // narrowed them once it would treat the checks that matter as redundant.
  const isDirty = () => dirty.current;
  const isBlocked = () => blocked.current;

  const save = useCallback(
    async (basedOn: string | null = version.current) => {
      // Nothing unsaved means nothing to write: a debounce timer set while an earlier save
      // was in flight can fire after that save already carried the text, and writing the
      // same bytes again is a change every sync client has to reconcile.
      if (basedOn === null || pending.current !== null || !isDirty()) {
        return;
      }

      const mine = opening.current;
      const request = write({ vault, directory, page }, text.current, basedOn);
      let succeeded = false;

      dirty.current = false;
      pending.current = request.then(
        (outcome) => (outcome.outcome === "saved" ? outcome.version : null),
        () => null,
      );
      setStatus("saving");

      try {
        const outcome = await request;

        // Another file opened meanwhile; the flush on leaving this one carries on from here.
        if (mine !== opening.current) {
          return;
        }

        if (outcome.outcome === "conflict") {
          blocked.current = true;
          dirty.current = true;
          setOnDisk(outcome.onDisk);
          setStatus("conflict");
          return;
        }

        version.current = outcome.version;
        succeeded = true;
        setFailure(null);
        setStatus(isDirty() ? "unsaved" : "saved");
      } catch (thrown: unknown) {
        if (mine !== opening.current) {
          return;
        }

        // The text is still in the editor and still marked unsaved; the next change, or
        // leaving the lecture, tries again.
        dirty.current = true;
        setFailure(asCommandError(thrown));
        setStatus("failed");
      } finally {
        if (mine === opening.current) {
          pending.current = null;
        }
      }

      // Typing that arrived during a successful save goes next. After a *failed* save it
      // waits for the next keystroke or for the lecture to close: retrying at once would
      // turn a full disk into a loop hammering it (caught by `useNotes.test.ts`).
      if (succeeded && isDirty() && !isBlocked()) {
        await save();
      }
    },
    [vault, directory, page],
  );

  useEffect(() => {
    const session = { cancelled: false };
    const live = () => !session.cancelled;

    opening.current += 1;
    pending.current = null;
    setLoaded(null);
    setStatus("loading");
    setOnDisk(null);
    blocked.current = false;
    dirty.current = false;
    version.current = null;

    void (async () => {
      try {
        const notes = await load(vault, directory, page);

        if (live()) {
          text.current = notes.text;
          version.current = notes.version;
          noteCitations(notes.text);
          setLoaded(notes);
          setGeneration((count) => count + 1);
          setFailure(null);
          setStatus("saved");
        }
      } catch (thrown: unknown) {
        if (live()) {
          setFailure(asCommandError(thrown));
          setStatus("failed");
        }
      }
    })();

    return () => {
      session.cancelled = true;

      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }

      // Leaving with unsaved text — closing the item, or opening another note or page in
      // it: save it now, to the file it was written in, rather than lose the last sentence.
      if (dirty.current && !blocked.current) {
        keepOnLeaving({ vault, directory, page }, text.current, version.current, pending.current);
      }
    };
  }, [vault, directory, page, noteCitations]);

  const change = useCallback(
    (next: string) => {
      text.current = next;
      dirty.current = true;
      noteCitations(next);

      if (blocked.current) {
        return;
      }

      setStatus("unsaved");

      if (timer.current !== null) {
        clearTimeout(timer.current);
      }

      timer.current = setTimeout(() => {
        timer.current = null;
        void save();
      }, SAVE_AFTER_MS);
    },
    [save, noteCitations],
  );

  const keepMine = useCallback(() => {
    if (onDisk === null) {
      return;
    }

    blocked.current = false;
    setOnDisk(null);
    void save(onDisk.version);
  }, [onDisk, save]);

  const takeTheirs = useCallback(() => {
    if (onDisk === null) {
      return;
    }

    blocked.current = false;
    dirty.current = false;
    text.current = onDisk.text;
    version.current = onDisk.version;
    noteCitations(onDisk.text);
    setLoaded(onDisk);
    setGeneration((count) => count + 1);
    setOnDisk(null);
    setStatus("saved");
  }, [onDisk, noteCitations]);

  return { loaded, generation, status, onDisk, failure, cited, linked, change, keepMine, takeTheirs };
}
