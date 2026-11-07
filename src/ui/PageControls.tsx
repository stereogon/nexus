/**
 * Pages and zoom, floating at the foot of the document (redesign canvas, 2026-11-07):
 * `‹ 4 / 18 › · − 124% + · Fit width`. Off the header, so the header holds what the
 * document is and how it is worked on, and these sit where the eye already is.
 */
import { PageField } from "./PageField";

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

export function PageControls({
  showing,
  pages,
  scale,
  fitting,
  limits,
  onGoTo,
  onZoom,
  onFit,
}: {
  readonly showing: number;
  readonly pages: number;
  readonly scale: number;
  readonly fitting: boolean;
  readonly limits: { readonly min: number; readonly max: number };
  readonly onGoTo: (index: number) => void;
  readonly onZoom: (direction: 1 | -1) => void;
  readonly onFit: () => void;
}) {
  const empty = pages === 0;

  return (
    <div aria-label="Pages and zoom" className="page-controls" role="toolbar">
      <button
        aria-label="Previous page"
        className="chrome-icon"
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
      <PageField onGoTo={onGoTo} pages={pages} showing={showing} />
      <span className="viewer-total">{empty ? "—" : `/ ${String(pages)}`}</span>
      <button
        aria-label="Next page"
        className="chrome-icon"
        disabled={empty || showing >= pages - 1}
        onClick={() => {
          onGoTo(showing + 1);
        }}
        type="button"
      >
        <Chevron back={false} />
      </button>

      <span aria-hidden="true" className="page-controls-divider" />

      <button
        aria-label="Zoom out"
        className="chrome-icon"
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
        className="chrome-icon"
        disabled={scale >= limits.max}
        onClick={() => {
          onZoom(1);
        }}
        type="button"
      >
        +
      </button>
      <button aria-pressed={fitting} className="page-fit" onClick={onFit} type="button">
        Fit width
      </button>
    </div>
  );
}
