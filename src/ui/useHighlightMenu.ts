/**
 * Which highlight menu is open, if any.
 *
 * # Why one hook rather than two pieces of state in the viewer
 *
 * There are two ways a menu opens and they answer different questions: a fresh selection
 * asks *mark this as what?*, and a badge click asks *what is this, and do I still want
 * it?*. Only one can be open at a time, and the viewer does not care which — it wants a
 * menu or nothing.
 *
 * Kept apart, those two were a pair of states with a rule about their combination, which
 * is the shape that drifts: a selection made while a badge menu was open would show two
 * menus. Here the rule is one expression, and the badge takes precedence because clicking
 * one is deliberate while a stale selection often just happens to still exist.
 */
import { useCallback, useState } from "react";

import type { Annotation, HighlightSemantic } from "../ipc/annotations";
import type { MenuAt } from "./menuPlacement";
import type { Annotations } from "./useAnnotations";
import { useSelection } from "./useSelection";

export type { MenuAt };

/** An open menu, and what its controls do. */
export interface OpenMenu {
  readonly at: MenuAt;
  /** `null` for an existing highlight, which cannot be re-tagged without losing its id. */
  readonly onChoose: ((semantic: HighlightSemantic) => void) | null;
  /** `null` for a selection, which is not yet anything to remove. */
  readonly onRemove: (() => void) | null;
}

export function useHighlightMenu(highlights: Annotations): {
  readonly open: OpenMenu | null;
  readonly pick: (annotation: Annotation, at: MenuAt) => void;
  readonly dismiss: () => void;
} {
  const selection = useSelection();
  const [picked, setPicked] = useState<{
    readonly annotation: Annotation;
    readonly at: MenuAt;
  } | null>(null);

  const pick = useCallback((annotation: Annotation, at: MenuAt) => {
    setPicked({ annotation, at });
  }, []);

  const dismiss = useCallback(() => {
    setPicked(null);
    selection.clear();
  }, [selection]);

  if (picked !== null) {
    return {
      open: {
        at: picked.at,
        onChoose: null,
        onRemove: () => {
          highlights.remove(picked.annotation.id);
          setPicked(null);
        },
      },
      pick,
      dismiss,
    };
  }

  const marking = selection.selected;

  if (marking === null) {
    return { open: null, pick, dismiss };
  }

  return {
    open: {
      at: marking.at,
      onChoose: (semantic: HighlightSemantic) => {
        highlights.add(marking.candidate, semantic);
        selection.clear();
      },
      onRemove: null,
    },
    pick,
    dismiss,
  };
}
