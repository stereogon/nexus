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

import type { Annotation, HighlightSemantic, NormalizedRect } from "../ipc/annotations";
import type { MenuAt } from "./menuPlacement";
import type { Annotations } from "./useAnnotations";
import { useSelection } from "./useSelection";

export type { MenuAt };

/** An open menu, and what its controls do. */
export interface OpenMenu {
  readonly at: MenuAt;
  /**
   * Marks the selection, or re-marks the picked highlight. `null` only for a text box,
   * which has no semantic. *(Until 2026-11-05 this was `null` for every existing
   * highlight: re-tagging meant removing and re-making it, which minted a new id and broke
   * every `cite://` link to it. `retag_annotation` keeps the id.)*
   */
  readonly onChoose: ((semantic: HighlightSemantic) => void) | null;
  /** What the picked highlight is marked as now, or `null` for a fresh selection. */
  readonly current: HighlightSemantic | null;
  /** `null` for a selection, which is not yet anything to remove. */
  readonly onRemove: (() => void) | null;
  /**
   * Cites it in the notes at the cursor (`claude-spec.md` §2.4), storing it first if it
   * is a fresh selection or box. Always offered.
   */
  readonly onLink: () => void;
}

/**
 * The meaning "Link to notes" gives something not yet marked.
 *
 * Linking a fresh selection has to store it, and a stored highlight has a meaning. Key
 * concept is the spec's first colour and the commonest reason to cite something; it can be
 * changed from the badge afterwards without breaking the citation, since a re-mark keeps
 * the id.
 */
const LINKED_AS: HighlightSemantic = "key";

/** What an annotation is marked as, or `null` for a text box, which is not marked. */
function semanticOf(annotation: Annotation): HighlightSemantic | null {
  return annotation.kind === "textBox" ? null : annotation.semantic;
}

/** A box drawn with Option held, waiting for a meaning to be chosen. */
export interface DrawnArea {
  readonly pageIndex: number;
  readonly region: NormalizedRect;
  readonly at: MenuAt;
}

export function useHighlightMenu(
  highlights: Annotations,
  /** Puts a citation of this annotation into the notes. */
  link: (annotation: Annotation) => void,
): {
  readonly open: OpenMenu | null;
  readonly pick: (annotation: Annotation, at: MenuAt) => void;
  readonly draw: (pageIndex: number, region: NormalizedRect, at: MenuAt) => void;
  /** The drawn box the open menu is for, so the viewer can keep it outlined. */
  readonly drawn: DrawnArea | null;
  readonly dismiss: () => void;
} {
  const { selected, clear } = useSelection();
  const [picked, setPicked] = useState<{
    readonly annotation: Annotation;
    readonly at: MenuAt;
  } | null>(null);

  const [drawn, setDrawn] = useState<DrawnArea | null>(null);

  const pick = useCallback((annotation: Annotation, at: MenuAt) => {
    setPicked({ annotation, at });
  }, []);

  // Stable, because the drag hook holds it in its own callback's dependencies.
  const draw = useCallback((pageIndex: number, region: NormalizedRect, at: MenuAt) => {
    setDrawn({ pageIndex, region, at });
  }, []);

  // Stable across renders, which is load-bearing rather than tidy: the viewer dismisses
  // the menu from an effect whenever the page under it moves, and an effect depending on
  // a function rebuilt every render would fire every render and the menu could never
  // open. `clear` is itself stable, so depending on it rather than on the object holding
  // it is what keeps this one stable too.
  const dismiss = useCallback(() => {
    setPicked(null);
    setDrawn(null);
    clear();
  }, [clear]);

  if (picked !== null) {
    const current = semanticOf(picked.annotation);

    return {
      open: {
        at: picked.at,
        current,
        onChoose:
          current === null
            ? null
            : (semantic: HighlightSemantic) => {
                highlights.retag(picked.annotation.id, semantic);
                setPicked(null);
              },
        onRemove: () => {
          highlights.remove(picked.annotation.id);
          setPicked(null);
        },
        onLink: () => {
          link(picked.annotation);
          setPicked(null);
        },
      },
      pick,
      draw,
      drawn: null,
      dismiss,
    };
  }

  // A drawn box comes after a picked badge and before a selection: drawing one is as
  // deliberate as clicking a badge, while a selection may simply be left over.
  if (drawn !== null) {
    return {
      open: {
        at: drawn.at,
        current: null,
        onChoose: (semantic: HighlightSemantic) => {
          void highlights.addArea(drawn.pageIndex, drawn.region, semantic);
          setDrawn(null);
        },
        onRemove: null,
        onLink: () => {
          void highlights.addArea(drawn.pageIndex, drawn.region, LINKED_AS).then((made) => {
            if (made !== null) {
              link(made);
            }
          });
          setDrawn(null);
        },
      },
      pick,
      draw,
      drawn,
      dismiss,
    };
  }

  const marking = selected;

  if (marking === null) {
    return { open: null, pick, draw, drawn: null, dismiss };
  }

  return {
    open: {
      at: marking.at,
      current: null,
      onChoose: (semantic: HighlightSemantic) => {
        void highlights.add(marking.candidate, semantic);
        clear();
      },
      onRemove: null,
      onLink: () => {
        void highlights.add(marking.candidate, LINKED_AS).then((made) => {
          if (made !== null) {
            link(made);
          }
        });
        clear();
      },
    },
    pick,
    draw,
    drawn: null,
    dismiss,
  };
}
