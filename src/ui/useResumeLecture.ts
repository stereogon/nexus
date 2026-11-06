/**
 * Opening, when a vault opens, the lecture this device last had open in it — so starting
 * Nexus again puts the reader back in the lecture, at the place `useReadingPosition` kept.
 *
 * Once per vault, and only into an empty pane: a lecture the person opened while this was
 * being looked up is newer intent, and is left alone. A remembered lecture since removed
 * from the vault is simply not reopened.
 */
import { useEffect, useRef } from "react";

import { lastLecture } from "../ipc/position";
import type { LectureRow } from "../ipc/vault";

export function useResumeLecture(
  vault: string | null,
  lectures: readonly LectureRow[],
  openDirectory: string | null,
  open: (vault: string, lecture: LectureRow) => void,
): void {
  const resumedFor = useRef<string | null>(null);
  const current = useRef(openDirectory);

  useEffect(() => {
    current.current = openDirectory;
  }, [openDirectory]);

  useEffect(() => {
    if (vault === null || resumedFor.current === vault) {
      return;
    }

    resumedFor.current = vault;

    void lastLecture(vault).then((directory) => {
      const lecture = lectures.find((row) => row.directory === directory);

      if (lecture !== undefined && lecture.documentReady && current.current === null) {
        open(vault, lecture);
      }
    });
  }, [vault, lectures, open]);
}
