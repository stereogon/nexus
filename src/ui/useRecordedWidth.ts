/**
 * A pane's chosen width on this device: loaded once, recorded when a choice settles.
 *
 * Shared by the notes and the sidebar (2026-11-07), which differ only in what a width is
 * measured from and held to. A width is recorded only when a drag ends or a key is pressed,
 * not on every pointer move: the file is one line, but a write per frame would be dozens
 * per second for a value only the last of which matters.
 */
import { useCallback, useEffect, useState } from "react";

import { lastPaneWidth, rememberPaneWidth, type Pane } from "../ipc/layout";

export function useRecordedWidth(pane: Pane): {
  /** The width chosen, or `null` until one is: the stylesheet's default applies. */
  readonly chosen: number | null;
  readonly choose: (width: number, settled: boolean) => void;
} {
  const [chosen, setChosen] = useState<number | null>(null);

  useEffect(() => {
    const session = { cancelled: false };

    void (async () => {
      const recorded = await lastPaneWidth(pane);

      if (!session.cancelled) {
        // Only if nothing was dragged meanwhile: a drag is newer than the file.
        setChosen((current) => current ?? recorded);
      }
    })();

    return () => {
      session.cancelled = true;
    };
  }, [pane]);

  const choose = useCallback(
    (width: number, settled: boolean) => {
      setChosen(width);

      if (settled) {
        void rememberPaneWidth(pane, width);
      }
    },
    [pane],
  );

  return { chosen, choose };
}
