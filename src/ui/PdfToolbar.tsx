/**
 * The viewer's toolbar.
 *
 * The canvas specifies `n / total · − · 124% · + · Fit width`. Three things here go beyond
 * it, added on request after the first real use, and marked as additions: arrows to step a
 * page, a number field to jump to one, and a Scroll/Page switch. The canvas shows a
 * continuous scroller and a page counter that only reports; reading one slide at a time is
 * a different way to work and the counter alone does not serve it.
 */
import type { ViewMode } from "./viewMode";

function Chevron({ back }: { readonly back: boolean }) {
  return (
    <svg aria-hidden="true" height="13" viewBox="0 0 13 13" width="13">
      <path
        d={back ? "M8 2.5 L4 6.5 L8 10.5" : "M5 2.5 L9 6.5 L5 10.5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function PdfToolbar({
  title,
  showing,
  pages,
  scale,
  fitting,
  mode,
  limits,
  onClose,
  onGoTo,
  onZoom,
  onFit,
  onMode,
}: {
  readonly title: string;
  /** Zero-based, as everything inside the viewer is. */
  readonly showing: number;
  readonly pages: number;
  readonly scale: number;
  readonly fitting: boolean;
  readonly mode: ViewMode;
  readonly limits: { readonly min: number; readonly max: number };
  readonly onClose: () => void;
  readonly onGoTo: (index: number) => void;
  readonly onZoom: (direction: 1 | -1) => void;
  readonly onFit: () => void;
  readonly onMode: (mode: ViewMode) => void;
}) {
  const empty = pages === 0;

  return (
    <div className="viewer-bar">
      <button className="quiet" onClick={onClose} type="button">
        ← Vault
      </button>
      <span className="viewer-title">{title}</span>

      <div className="viewer-pages">
        <button
          aria-label="Previous page"
          className="quiet"
          disabled={empty || showing === 0}
          onClick={() => {
            onGoTo(showing - 1);
          }}
          type="button"
        >
          <Chevron back />
        </button>

        <label className="vh" htmlFor="page-number">
          Page number
        </label>
        <input
          disabled={empty}
          id="page-number"
          max={Math.max(1, pages)}
          min={1}
          onChange={(event) => {
            const asked = Number.parseInt(event.target.value, 10);

            // Ignored rather than clamped while typing: clamping turns a half-typed "12"
            // into "1" the moment the 1 lands, and the field fights the person.
            if (Number.isInteger(asked) && asked >= 1 && asked <= pages) {
              onGoTo(asked - 1);
            }
          }}
          type="number"
          value={empty ? "" : showing + 1}
        />
        <span className="viewer-total">{empty ? "—" : `/ ${String(pages)}`}</span>

        <button
          aria-label="Next page"
          className="quiet"
          disabled={empty || showing >= pages - 1}
          onClick={() => {
            onGoTo(showing + 1);
          }}
          type="button"
        >
          <Chevron back={false} />
        </button>
      </div>

      <div className="viewer-zoom">
        <button
          aria-label="Zoom out"
          className="quiet"
          disabled={scale <= limits.min}
          onClick={() => {
            onZoom(-1);
          }}
          type="button"
        >
          −
        </button>
        <span className="viewer-scale">{`${String(Math.round(scale * 100))}%`}</span>
        <button
          aria-label="Zoom in"
          className="quiet"
          disabled={scale >= limits.max}
          onClick={() => {
            onZoom(1);
          }}
          type="button"
        >
          +
        </button>
        <button
          aria-pressed={fitting}
          className={fitting ? "quiet on" : "quiet"}
          onClick={onFit}
          type="button"
        >
          Fit width
        </button>
      </div>

      {/* Not on the canvas: see this file's note. */}
      <div aria-label="View mode" className="segmented" role="group">
        <button
          aria-pressed={mode === "scroll"}
          onClick={() => {
            onMode("scroll");
          }}
          type="button"
        >
          Scroll
        </button>
        <button
          aria-pressed={mode === "page"}
          onClick={() => {
            onMode("page");
          }}
          type="button"
        >
          Page
        </button>
      </div>
    </div>
  );
}
