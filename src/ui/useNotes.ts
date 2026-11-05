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
 * # Conflicts
 *
 * If `notes.md` changed outside this window, the save writes nothing and this holds both
 * versions: the editor keeps the person's text, and they choose. Saving stops until they
 * do, so nothing is written over the other version by accident.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { loadNotes, saveNotes, type Notes } from "../ipc/notes";
import { citedIds } from "../notes/citeLinks";
import { asCommandError, type CommandError } from "../ipc/vault";

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
  /** The editor's text changed. */
  readonly change: (text: string) => void;
  /** Save the editor's text over the version on disk, having seen it. */
  readonly keepMine: () => void;
  /** Replace the editor's text with the version on disk. */
  readonly takeTheirs: () => void;
}

export function useNotes(vault: string, directory: string): NotesState {
  const [loaded, setLoaded] = useState<Notes | null>(null);
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [onDisk, setOnDisk] = useState<Notes | null>(null);
  const [failure, setFailure] = useState<CommandError | null>(null);
  const [cited, setCited] = useState<ReadonlySet<string>>(new Set());

  // Replaced only when the set of ids actually changes, so typing an ordinary sentence
  // does not re-render every page of the document.
  const noteCitations = useCallback((text: string) => {
    const next = new Set(citedIds(text));

    setCited((current) =>
      current.size === next.size && [...next].every((id) => current.has(id)) ? current : next,
    );
  }, []);

  // Held in refs, not state: the save loop reads the latest of each without re-rendering,
  // and a timer callback must not see the values from the render that scheduled it.
  const text = useRef("");
  const version = useRef<string | null>(null);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (basedOn === null || inFlight.current || !isDirty()) {
        return;
      }

      inFlight.current = true;
      dirty.current = false;
      setStatus("saving");

      const sending = text.current;
      let succeeded = false;

      try {
        const outcome = await saveNotes(vault, directory, sending, basedOn);

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
        // The text is still in the editor and still marked unsaved; the next change, or
        // leaving the lecture, tries again.
        dirty.current = true;
        setFailure(asCommandError(thrown));
        setStatus("failed");
      } finally {
        inFlight.current = false;
      }

      // Typing that arrived during a successful save goes next. After a *failed* save it
      // waits for the next keystroke or for the lecture to close: retrying at once would
      // turn a full disk into a loop hammering it (caught by `useNotes.test.ts`).
      if (succeeded && isDirty() && !isBlocked()) {
        await save();
      }
    },
    [vault, directory],
  );

  // A ref to the latest `save`, for the unmount flush, which must use this lecture's.
  const latestSave = useRef(save);
  latestSave.current = save;

  useEffect(() => {
    const session = { cancelled: false };
    const live = () => !session.cancelled;

    setLoaded(null);
    setStatus("loading");
    setOnDisk(null);
    blocked.current = false;
    dirty.current = false;
    version.current = null;

    void (async () => {
      try {
        const notes = await loadNotes(vault, directory);

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

      // Leaving with unsaved text: save it now rather than lose the last sentence.
      if (dirty.current && !blocked.current) {
        void latestSave.current();
      }
    };
  }, [vault, directory, noteCitations]);

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

  return { loaded, generation, status, onDisk, failure, cited, change, keepMine, takeTheirs };
}
