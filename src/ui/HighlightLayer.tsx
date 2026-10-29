/**
 * The highlights drawn over one page.
 *
 * # Why the fill does not take clicks
 *
 * The layer sits above the page canvas and the pdf.js text layer, and the text layer is
 * what makes selection work. A highlight that accepted pointer events would make the words
 * under it unselectable — so highlighting a sentence would be the last thing anyone could
 * ever do to it. The fill is therefore `pointer-events: none`, and only the small glyph
 * badge takes a click.
 *
 * That badge is also the §3 requirement: the letter is what lets the four semantics be
 * told apart without relying on hue, so it is drawn for every highlight rather than only
 * on hover.
 *
 * A text box is not drawn here. The domain can store one, nothing creates one yet, and
 * inventing a rendering for a shape no code produces would be a guess sitting in the file
 * looking like a decision.
 */
import type { Annotation, NormalizedRect } from "../ipc/annotations";
import type { MenuAt } from "./menuPlacement";
import { BADGE_SIZE, badgeAt } from "./highlightBadge";
import { SEMANTIC_GLYPH, SEMANTIC_LABEL } from "./semantics";

/** The area a highlight covers, or `null` for a kind this layer does not draw. */
export function rectsOf(annotation: Annotation): readonly NormalizedRect[] | null {
  switch (annotation.kind) {
    case "textHighlight":
      return annotation.rects;
    case "areaHighlight":
      return [annotation.region];
    case "textBox":
      return null;
  }
}

/** What a highlight says when read out: its meaning, then what it covers. */
function describe(annotation: Annotation): string {
  if (annotation.kind === "textBox") {
    return annotation.text;
  }

  const covered =
    annotation.kind === "textHighlight" ? annotation.quote : (annotation.caption ?? "");

  return covered === ""
    ? SEMANTIC_LABEL[annotation.semantic]
    : `${SEMANTIC_LABEL[annotation.semantic]}: ${covered}`;
}

export function HighlightLayer({
  annotations,
  width,
  height,
  onPick,
}: {
  readonly annotations: readonly Annotation[];
  readonly width: number;
  readonly height: number;
  readonly onPick: (annotation: Annotation, at: MenuAt) => void;
}) {
  if (annotations.length === 0) {
    return null;
  }

  return (
    <div className="highlight-layer">
      {annotations.map((annotation) => {
        const rects = rectsOf(annotation);

        if (rects === null || annotation.kind === "textBox") {
          return null;
        }

        const badge = badgeAt(rects, { width, height });

        return (
          <div key={annotation.id}>
            {rects.map((rect, at) => (
              <div
                className="highlight"
                data-semantic={annotation.semantic}
                key={`${annotation.id}:${String(at)}`}
                style={{
                  left: rect.x * width,
                  top: rect.y * height,
                  width: rect.width * width,
                  height: rect.height * height,
                }}
              />
            ))}

            {badge !== null && (
              <button
                aria-label={describe(annotation)}
                className="highlight-badge"
                data-semantic={annotation.semantic}
                onClick={(event) => {
                  // Measured from the badge itself rather than from the pointer, so the
                  // menu lands in the same place however the button was activated --
                  // including from the keyboard, where there is no pointer at all.
                  const box = event.currentTarget.getBoundingClientRect();

                  onPick(annotation, {
                    left: box.left,
                    top: box.bottom + 8,
                    above: box.top - 8,
                  });
                }}
                style={{ left: badge.left, top: badge.top, width: BADGE_SIZE, height: BADGE_SIZE }}
                type="button"
              >
                {SEMANTIC_GLYPH[annotation.semantic]}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
