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

/** A lecture on screen, with the title to show above it. */
export interface OpenLecture {
  readonly document: OpenedDocument;
  readonly title: string;
}

export interface Opening {
  /** The lecture being read, if one is. */
  readonly lecture: OpenLecture | null;
  /** True while the document is being located and screened. */
  readonly opening: boolean;
  /** Why it could not be opened, if it could not. */
  readonly failure: CommandError | null;
  readonly open: (vault: string, lecture: LectureRow) => void;
  readonly close: () => void;
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
          document: await openDocument(vault, row.directory),
          title: row.title,
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

  const close = useCallback(() => {
    setLecture(null);
    setFailure(null);
  }, []);

  return { lecture, opening, failure, open, close };
}
