/**
 * Choosing what a highlight means.
 *
 * Four swatches, each carrying its letter as well as its colour, because §3 requires the
 * set not to rely on hue alone — and a menu that showed only colours would be the one
 * place that requirement was quietly dropped.
 *
 * Positioned against the window rather than the page: the pages scroll under it, and a
 * menu anchored into the scrolling content would drift away from the selection it belongs
 * to. It is dismissed on scroll instead, which is also the honest behaviour — a selection
 * scrolled out of sight should not keep a menu on screen.
 *
 * # Why it measures itself
 *
 * Where it fits depends on how wide it is, and how wide it is depends on what it holds —
 * four swatches, or a Remove button. Measuring after mount and before paint is the only
 * way to know, and the alternative, an estimated width in a constant, is wrong the first
 * time the menu gains a control.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { HighlightSemantic } from "../ipc/annotations";
import { placeMenu, type MenuAt } from "./menuPlacement";
import { SEMANTIC_GLYPH, SEMANTIC_LABEL, SEMANTICS } from "./semantics";

export function HighlightMenu({
  at,
  current,
  onChoose,
  onRemove,
  onLink,
  onDismiss,
}: {
  readonly at: MenuAt;
  /**
   * What a picked highlight is marked as now, shown pressed. `null` for a fresh
   * selection, whose four swatches are plain actions rather than a choice already made.
   */
  readonly current: HighlightSemantic | null;
  /**
   * Marks a selection, or re-marks an existing highlight keeping its id — the id is what
   * `cite://` in the notes points at. `null` only for something with no semantic.
   * *(Until 2026-11-05 this was `null` for every existing highlight, since the only way
   * to re-mark one was to remove it and make another, which broke its links.)*
   */
  readonly onChoose: ((semantic: HighlightSemantic) => void) | null;
  /** Offered only for a highlight that already exists. */
  readonly onRemove: (() => void) | null;
  /** Cites it in the notes beside the document; `null` where that means nothing — in the notes. */
  readonly onLink: (() => void) | null;
  readonly onDismiss: () => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const { left, top, above } = at;
  const [placed, setPlaced] = useState({ left, top });

  // Before paint, not after: `useEffect` would show the menu off the edge for one frame
  // and then snap it back, which reads as a flicker rather than as a menu opening.
  useLayoutEffect(() => {
    const element = box.current;

    if (element === null) {
      return;
    }

    const measured = element.getBoundingClientRect();

    setPlaced(
      placeMenu(
        { left, top, above },
        { width: measured.width, height: measured.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
    // Depends on the three numbers rather than on `at`, which is rebuilt every render and
    // would make this effect run forever.
  }, [left, top, above]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  return (
    <div
      aria-label="Highlight as"
      className="highlight-menu"
      // Pressing a control must not take focus from what was selected: in the notes, losing
      // focus closes this menu before the click lands; in the document it would drop the
      // text selection the menu is for.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      ref={box}
      role="group"
      style={{ left: placed.left, top: placed.top }}
    >
      {onChoose !== null &&
        SEMANTICS.map((semantic) => (
          <button
            aria-label={SEMANTIC_LABEL[semantic]}
            // A pressed state only when there is a current meaning to show. On a fresh
            // selection `aria-pressed="false"` on all four would announce a choice that
            // has not been offered yet.
            aria-pressed={current === null ? undefined : semantic === current}
            className="highlight-pick"
            data-semantic={semantic}
            key={semantic}
            onClick={() => {
              onChoose(semantic);
            }}
            title={SEMANTIC_LABEL[semantic]}
            type="button"
          >
            {SEMANTIC_GLYPH[semantic]}
          </button>
        ))}

      {/* The spec's quick-action bar puts this beside the swatches (§2.4). */}
      {onLink !== null && (
        <button className="highlight-link" onClick={onLink} title="Link to notes (⌘L)" type="button">
          Link to notes
        </button>
      )}

      {onRemove !== null && (
        <button className="highlight-remove" onClick={onRemove} type="button">
          Remove
        </button>
      )}
    </div>
  );
}
