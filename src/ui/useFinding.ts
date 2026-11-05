/**
 * Finding things in the vault: the sidebar search inside lectures, the highlights library,
 * and opening a lecture at whatever was found. Gathered here, out of `App`, because the
 * three share one job — getting from "it's somewhere in my notes" to the place itself.
 */
import { useCallback, useMemo, useState } from "react";

import type { LectureRow } from "../ipc/vault";
import { useArrival, type Arrival, type ArrivalTarget } from "./useArrival";
import type { Opening } from "./useOpenLecture";
import { useVaultSearch } from "./useVaultSearch";

export function useFinding(
  vault: string | null,
  lectures: readonly LectureRow[],
  query: string,
  reading: Pick<Opening, "open" | "lecture">,
): {
  readonly search: ReturnType<typeof useVaultSearch>;
  readonly library: boolean;
  readonly toggleLibrary: () => void;
  readonly closeLibrary: () => void;
  readonly arrival: Arrival | null;
  /** Opens a lecture at a found place, leaving the library if it was open. */
  readonly goTo: (lecture: LectureRow, target: ArrivalTarget) => void;
} {
  const [library, setLibrary] = useState(false);
  const { arrival, openAt } = useArrival(reading.open, reading.lecture?.lecture.directory ?? null);
  const directories = useMemo(() => lectures.map((lecture) => lecture.directory), [lectures]);
  const search = useVaultSearch(vault, directories, query);

  const toggleLibrary = useCallback(() => {
    setLibrary((shown) => !shown);
  }, []);

  const closeLibrary = useCallback(() => {
    setLibrary(false);
  }, []);

  const goTo = useCallback(
    (lecture: LectureRow, target: ArrivalTarget) => {
      if (vault !== null) {
        setLibrary(false);
        openAt(vault, lecture, target);
      }
    },
    [openAt, vault],
  );

  return { search, library, toggleLibrary, closeLibrary, arrival, goTo };
}
