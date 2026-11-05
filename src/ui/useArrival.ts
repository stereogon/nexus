/**
 * Opening a lecture at a particular place: a highlight, or a line of its notes.
 *
 * Search results and the highlights library both lead somewhere inside a lecture. The
 * lecture is opened as from the sidebar — not again if it is already open — and the place
 * is handed to `Reading`, which waits for the document or the notes to be ready before
 * going there. A nonce makes choosing the same place twice go there twice.
 */
import { useCallback, useState } from "react";

import type { LectureRow } from "../ipc/vault";

export type ArrivalTarget =
  | { readonly kind: "highlight"; readonly id: string }
  | { readonly kind: "line"; readonly line: number };

export interface Arrival {
  readonly directory: string;
  readonly target: ArrivalTarget;
  readonly nonce: number;
}

export function useArrival(
  open: (vault: string, lecture: LectureRow) => void,
  openDirectory: string | null,
): {
  readonly arrival: Arrival | null;
  readonly openAt: (vault: string, lecture: LectureRow, target: ArrivalTarget) => void;
} {
  const [arrival, setArrival] = useState<Arrival | null>(null);

  const openAt = useCallback(
    (vault: string, lecture: LectureRow, target: ArrivalTarget) => {
      if (lecture.directory !== openDirectory) {
        open(vault, lecture);
      }

      setArrival((previous) => ({ directory: lecture.directory, target, nonce: (previous?.nonce ?? 0) + 1 }));
    },
    [open, openDirectory],
  );

  return { arrival, openAt };
}
