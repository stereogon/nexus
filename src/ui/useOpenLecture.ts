/**
 * Opening a lecture into the viewer, and closing it again.
 *
 * Its own hook because the screening step makes this more than setting a field: a lecture
 * is located, verified to be a PDF and scanned before the window is allowed to read it,
 * any of which can fail with something a person needs to be told. `App` holds the shell
 * and should not also hold that sequence.
 */
import { useCallback, useState } from "react";

import { openDocument, type OpenedDocument } from "../ipc/document";
import { asCommandError, type CommandError, type LectureRow } from "../ipc/vault";

/** An item on screen: the screened document, and the row it came from. */
export interface OpenLecture {
  /** `null` for a plain note, which has only its notes. */
  readonly document: OpenedDocument | null;
  /**
   * The row itself, not just its title.
   *
   * The shell needs the directory to mark the right sidebar row and the facets to build
   * the breadcrumb. Looking those back up by title would be wrong as soon as two lectures
   * share one, which nothing prevents — two courses both having a "Week 1" is ordinary.
   */
  readonly lecture: LectureRow;
}

export interface Opening {
  /** The lecture being read, if one is. */
  readonly lecture: OpenLecture | null;
  /** True while the document is being located and screened. */
  readonly opening: boolean;
  /** Why it could not be opened, if it could not. */
  readonly failure: CommandError | null;
  readonly open: (vault: string, lecture: LectureRow) => void;
  /** Replaces the open lecture's row after an edit, if the edit was to that lecture. */
  readonly refile: (edited: string, saved: LectureRow) => void;
  readonly close: () => void;
}

/**
 * The open lecture after an edit, which may or may not be the one that was edited.
 *
 * Pure and exported so the rule can be tested without opening a document: the interesting
 * case is editing a *different* lecture while one is open, which must leave the open one
 * alone.
 *
 * The document is carried across untouched rather than re-opened. An edit writes facets
 * into `manifest.json` and, as the editor's own hint says, does not move the folder — so
 * the bytes on screen are still the right bytes, and re-screening them would throw away a
 * loaded PDF to arrive back where it started.
 */
export function refiled(
  open: OpenLecture | null,
  edited: string,
  saved: LectureRow,
): OpenLecture | null {
  if (open === null || open.lecture.directory !== edited) {
    return open;
  }

  return { document: open.document, lecture: saved };
}

export function useOpenLecture(): Opening {
  const [lecture, setLecture] = useState<OpenLecture | null>(null);
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<CommandError | null>(null);

  const open = useCallback((vault: string, row: LectureRow) => {
    void (async () => {
      setOpening(true);
      setFailure(null);

      try {
        setLecture({
          // A note has nothing to locate or screen: its notes load themselves.
          document: row.kind === "note" ? null : await openDocument(vault, row.directory),
          lecture: row,
        });
      } catch (thrown: unknown) {
        // Reported, not swallowed: `ERR_DOCUMENT_NOT_READY` and `ERR_NOT_A_PDF` each have
        // a sentence saying what to do, and they are the two most likely outcomes for a
        // lecture that came in from a university system.
        setFailure(asCommandError(thrown));
        setLecture(null);
      } finally {
        setOpening(false);
      }
    })();
  }, []);

  const refile = useCallback((edited: string, saved: LectureRow) => {
    setLecture((current) => refiled(current, edited, saved));
  }, []);

  const close = useCallback(() => {
    setLecture(null);
    setFailure(null);
  }, []);

  return { lecture, opening, failure, open, refile, close };
}
