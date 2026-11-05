/**
 * Sticky notes on the slides: which is open, and the one being written.
 *
 * Free-standing, as the user chose on 2026-11-05: a note is the existing text-box kind,
 * created beside a highlight and independent of it afterwards — dragged anywhere, kept if
 * the highlight goes. Folded to a small icon until clicked, so a slide with several notes
 * stays readable; one is open at a time.
 *
 * A note being written is a *draft* until it has words. Nothing is stored for a note that
 * was opened and abandoned, so an empty card can never end up on a slide.
 */
import { useCallback, useState } from "react";

import type { Annotation, NormalizedRect, TextBoxEdit } from "../ipc/annotations";
import { bounding } from "../pdf/geometry";
import { STICKY_SIZE, stickyBeside } from "../pdf/sticky";
import { BADGE_SIZE } from "./highlightBadge";
import { rectsOf } from "./HighlightLayer";
import type { Annotations } from "./useAnnotations";

/** A note being written, not yet stored. */
export interface StickyDraft {
  readonly pageIndex: number;
  readonly region: NormalizedRect;
}

export interface Stickies {
  /** The note shown open, by id, or `null` when all are folded. */
  readonly open: string | null;
  readonly draft: StickyDraft | null;
  readonly toggle: (id: string) => void;
  /** Starts a note beside this highlight. */
  readonly startBeside: (highlight: Annotation) => void;
  /** Stores the draft with these words; the note then shows folded, like the others. */
  readonly create: (text: string) => void;
  readonly cancel: () => void;
  readonly edit: (id: string, edit: TextBoxEdit) => void;
  readonly remove: (id: string) => void;
  /** Cites a note in the notes beside the document. */
  readonly link: (note: Annotation) => void;
}

/** Room after a highlight for its badge, its notes indicator, and a little air, in pixels. */
const CLEAR_OF_BADGE = BADGE_SIZE * 2 + 3 + 8;

export function useStickies(
  highlights: Annotations,
  link: (note: Annotation) => void,
  /** A page's drawn width in pixels, counting from zero, to keep a new note clear of the badge. */
  pageWidth: (pageIndex: number) => number,
): Stickies {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<StickyDraft | null>(null);
  const { addTextBox, editTextBox, remove: removeAnnotation } = highlights;

  const toggle = useCallback((id: string) => {
    setDraft(null);
    setOpen((current) => (current === id ? null : id));
  }, []);

  const startBeside = useCallback(
    (highlight: Annotation) => {
      const rects = rectsOf(highlight);
      const area = rects === null ? null : bounding(rects);
      const width = pageWidth(highlight.page - 1);

      if (area !== null) {
        setOpen(null);
        setDraft({
          pageIndex: highlight.page - 1,
          region: stickyBeside(area, STICKY_SIZE, width > 0 ? CLEAR_OF_BADGE / width : undefined),
        });
      }
    },
    [pageWidth],
  );

  const create = useCallback(
    (text: string) => {
      if (draft === null || text.trim() === "") {
        return;
      }

      void addTextBox(draft.pageIndex, draft.region, text);
      setDraft(null);
    },
    [draft, addTextBox],
  );

  const cancel = useCallback(() => {
    setDraft(null);
  }, []);

  const remove = useCallback(
    (id: string) => {
      removeAnnotation(id);
      setOpen(null);
    },
    [removeAnnotation],
  );

  return { open, draft, toggle, startBeside, create, cancel, edit: editTextBox, remove, link };
}
