/**
 * The drop target, shown while a drag is over the window.
 *
 * Taken from the approved canvas's *Import · drag over window* state: a dashed accent
 * zone, the two sentences, the format chips as mono pills, and the ⌘O line beneath. The
 * canvas draws it as a card; here it covers the window, which is what "drag over window"
 * means once there is a window to drag over.
 *
 * The arrow is the canvas's own path data rather than a redrawn one, with `currentColor`
 * in place of its hardcoded `#BE1A72` so the dark theme's accent reaches it — the canvas
 * states that colour for the light artboard, and `--accent` is where that choice lives.
 */

/** The upward arrow into a tray, copied from the canvas's drop state. */
function DropArrow() {
  return (
    <svg
      aria-hidden="true"
      className="drop-arrow"
      height="30"
      viewBox="0 0 30 30"
      width="30"
    >
      <path
        d="M15 21 L15 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M9.5 12.5 L15 7 L20.5 12.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M5.5 19 L5.5 23.5 L24.5 23.5 L24.5 19"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/**
 * The overlay itself.
 *
 * `aria-hidden`, because it is feedback for a gesture only a pointer can make, and it says
 * nothing a screen reader user can act on. The same import is reachable from the *Add a
 * lecture* button and from ⌘O, which is the path that is actually operable.
 */
export function DropOverlay({
  formats,
}: {
  readonly formats: readonly string[];
}) {
  return (
    <div aria-hidden="true" className="drop-overlay">
      <div className="drop-zone">
        <DropArrow />
        <div className="drop-title">Drop to add a lecture</div>
        <div className="drop-detail">
          Files are copied into the vault, never moved
        </div>
        <div className="drop-formats">
          {formats.map((format) => (
            <span className="drop-format" key={format}>
              {format}
            </span>
          ))}
        </div>
      </div>
      <div className="drop-browse">
        or press <span className="key">⌘O</span> to browse
      </div>
    </div>
  );
}
