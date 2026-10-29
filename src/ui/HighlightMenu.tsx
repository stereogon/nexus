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
 */
import { useEffect } from "react";

import type { HighlightSemantic } from "../ipc/annotations";
import { SEMANTIC_GLYPH, SEMANTIC_LABEL, SEMANTICS } from "./semantics";

export function HighlightMenu({
  at,
  onChoose,
  onRemove,
  onDismiss,
}: {
  readonly at: { readonly left: number; readonly top: number };
  /**
   * Offered for a new selection. `null` for a highlight that already exists, because
   * re-tagging one needs a command that keeps its id: removing and adding would mint a
   * new one, and the id is what `cite://` in the notes points at. Until that command
   * exists, an existing highlight can be removed and made again rather than silently
   * breaking a citation.
   */
  readonly onChoose: ((semantic: HighlightSemantic) => void) | null;
  /** Offered only for a highlight that already exists. */
  readonly onRemove: (() => void) | null;
  readonly onDismiss: () => void;
}) {
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
      role="group"
      style={{ left: at.left, top: at.top }}
    >
      {onChoose !== null &&
        SEMANTICS.map((semantic) => (
          <button
            aria-label={SEMANTIC_LABEL[semantic]}
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

      {onRemove !== null && (
        <button className="highlight-remove" onClick={onRemove} type="button">
          Remove
        </button>
      )}
    </div>
  );
}
