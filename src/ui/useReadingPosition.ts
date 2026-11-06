/**
 * Reopening a lecture where this device left it, and remembering where that is.
 *
 * Restored once per lecture, as soon as its pages are measured — unless the lecture was
 * opened to go somewhere particular (a search result, a citation), which is newer intent
 * than an old scroll position. Recorded when scrolling pauses, and once more as the lecture
 * closes, so the last half-second of reading is not lost; per-device state, never written
 * into the vault (`ipc/position.ts`).
 */
import { useEffect, useRef, type RefObject } from "react";

import { lecturePosition, rememberPosition, type Position } from "../ipc/position";
import type { PageBox } from "../pdf/pages";
import { positionAt, scrollFor } from "../pdf/position";
import type { ViewMode } from "./viewMode";

/** How long scrolling must pause before the place is written down. */
export const POSITION_PAUSE_MS = 500;

export function useReadingPosition({
  vault,
  directory,
  boxes,
  mode,
  showing,
  scroller,
  arriving,
}: {
  readonly vault: string;
  readonly directory: string;
  readonly boxes: readonly PageBox[];
  readonly mode: ViewMode;
  /** The page being read, counting from zero. */
  readonly showing: number;
  readonly scroller: RefObject<HTMLDivElement | null>;
  /** Whether the lecture was opened to go somewhere particular. */
  readonly arriving: boolean;
}): void {
  // The latest layout, read when an answer or a timer arrives rather than captured when it
  // was started: the page sizes settle as the viewer measures itself.
  const latest = useRef({ boxes, mode, showing });
  const restoredFor = useRef<string | null>(null);
  // Set while a lecture is open: writes the place down once scrolling or paging pauses.
  const scheduleSave = useRef<(() => void) | null>(null);

  useEffect(() => {
    latest.current = { boxes, mode, showing };
  }, [boxes, mode, showing]);

  const measured = boxes.length > 0;

  useEffect(() => {
    if (!measured || restoredFor.current === directory) {
      return;
    }

    restoredFor.current = directory;

    if (arriving) {
      return;
    }

    void lecturePosition(vault, directory).then((place) => {
      const top = place === null ? null : scrollFor(latest.current.boxes, place);

      if (top !== null && latest.current.mode === "scroll") {
        scroller.current?.scrollTo({ top });
      }
    });
  }, [vault, directory, measured, arriving, scroller]);

  useEffect(() => {
    const element = scroller.current;

    if (element === null || !measured) {
      return undefined;
    }

    const place = (): Position | null => {
      const { boxes: now, mode: layout, showing: page } = latest.current;

      if (layout === "scroll") {
        return positionAt(now, element.scrollTop);
      }

      const height = now[page]?.height ?? 0;

      return { page: page + 1, offset: height > 0 ? Math.min(element.scrollTop / height, 0.999) : 0 };
    };

    // Worked out as it happens, while the element is on screen. Read at close instead, it
    // came from an element React had already removed — which scrolls nowhere, and wrote
    // page 1 over the real place (found by the journey).
    let last = place();

    const save = () => {
      if (last !== null) {
        void rememberPosition(vault, directory, last);
      }
    };

    let timer: number | null = null;

    const schedule = () => {
      last = place() ?? last;

      if (timer !== null) {
        window.clearTimeout(timer);
      }

      timer = window.setTimeout(() => {
        timer = null;
        save();
      }, POSITION_PAUSE_MS);
    };

    // Opening the lecture is itself worth recording: it is now the one this device had open.
    schedule();
    scheduleSave.current = schedule;
    element.addEventListener("scroll", schedule, { passive: true });

    return () => {
      element.removeEventListener("scroll", schedule);
      scheduleSave.current = null;

      // Closing or switching lecture: written now, rather than lost with the timer.
      if (timer !== null) {
        window.clearTimeout(timer);
        save();
      }
    };
  }, [vault, directory, measured, scroller]);

  // Page mode moves between pages without scrolling; a new page is a new place.
  useEffect(() => {
    if (mode === "page") {
      scheduleSave.current?.();
    }
  }, [mode, showing]);
}
