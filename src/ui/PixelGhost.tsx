/**
 * A pixel-art ghost, for the pane with nothing in it.
 *
 * # Why a bitmap and not an asset
 *
 * It is drawn from the character grid below rather than imported as a file, for three
 * reasons that all matter here. It ships inside the bundle, so there is no image request
 * and nothing to go missing — §3 forbids the app reaching the network for anything. It
 * takes its colour from `currentColor`, so one CSS token themes it and it cannot drift
 * from the palette the way a baked-in PNG would. And it stays editable: moving an eye is a
 * character in a string, legible in a diff, with no tool between the intent and the file.
 *
 * The eyes are *absent* pixels rather than light ones, so the pane's own background shows
 * through and the sprite sits on any surface without a halo.
 */

/** The sprite, one character per pixel. `#` is drawn; anything else is a hole. */
const GHOST = [
  "...######...",
  ".##########.",
  "############",
  "############",
  "##..####..##",
  "##..####..##",
  "############",
  "############",
  "############",
  "############",
  "############",
  "##..####..##",
] as const;

/** A horizontal run of drawn pixels: where it starts, and how wide it is. */
type Run = { readonly from: number; readonly width: number };

/**
 * The runs of drawn pixels in one row.
 *
 * Merged into runs rather than emitted as one rect per pixel, which would put 110 elements
 * in the document for a decoration. It also makes the rendered SVG readable, which is the
 * difference between a sprite someone can adjust and one they replace.
 */
export function runs(row: string): readonly Run[] {
  const found: Run[] = [];
  let from: number | null = null;

  for (let at = 0; at <= row.length; at += 1) {
    const drawn = row[at] === "#";

    if (drawn && from === null) {
      from = at;
    } else if (!drawn && from !== null) {
      found.push({ from, width: at - from });
      from = null;
    }
  }

  return found;
}

export function PixelGhost() {
  const width = GHOST[0].length;

  return (
    // Decorative: the line beside it carries the meaning, so a screen reader that also
    // announced "ghost" would be reading out the wallpaper.
    <svg
      aria-hidden="true"
      className="pixel-ghost"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${String(width)} ${String(GHOST.length)}`}
    >
      {GHOST.flatMap((row, y) =>
        runs(row).map(({ from, width: run }) => (
          <rect
            fill="currentColor"
            height="1"
            key={`${String(y)}:${String(from)}`}
            width={String(run)}
            x={String(from)}
            y={String(y)}
          />
        )),
      )}
    </svg>
  );
}
