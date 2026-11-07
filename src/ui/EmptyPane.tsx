/**
 * The document pane with no document in it.
 *
 * Its own component for the same reason `Welcome` is: it is a state of the window with
 * nothing in common with the viewer that replaces it. The canvas has no artboard for it —
 * every Workspace artboard shows a lecture open — so it needs an artboard, and until then
 * it is designed here on purpose rather than by default.
 *
 * # Why there is a ghost on it
 *
 * The pane is the largest surface in the window and, before a lecture is chosen, it was
 * one grey sentence in the middle of it. A drawing and a lighter line make the state read
 * as somewhere to arrive at rather than something that failed to load — §1.4: the reader
 * is a tired student, and the first screen of the evening setting a friendly tone is worth
 * the twelve rows of pixels.
 *
 * The **joke is never the instruction.** The rotating line is decoration; the sentence
 * under it always says the same three ways to open something. An empty state that is only
 * witty leaves someone no better off than a blank pane.
 */
import { useState } from "react";

import { PixelGhost } from "./PixelGhost";

/**
 * The lines the pane greets you with, one picked per visit.
 *
 * Several rather than one because the pane is seen every time something is closed, and a
 * fixed joke stops being one by the third reading. Mild on purpose: this sits in front of
 * someone revising, and a pane that is trying too hard is worse than a plain one.
 */
export const EMPTY_LINES = [
  "Nothing open.",
  "A ghost town in here.",
  "Quiet. Suspiciously quiet.",
  "Nothing on the desk.",
  "Empty. The ghost does not mind.",
] as const;

/**
 * Picks a line from a roll in `[0, 1)`.
 *
 * The roll is a parameter rather than a `Math.random()` call inside, which is what makes
 * this testable at all: a function that reaches for randomness itself can only be checked
 * by running it enough times to feel sure.
 */
export function lineFor(roll: number): string {
  const clamped = Math.min(Math.max(roll, 0), 0.999_999);

  return EMPTY_LINES[Math.floor(clamped * EMPTY_LINES.length)] ?? EMPTY_LINES[0];
}

export function EmptyPane({
  busy,
  onAdd,
  onChooseVault,
}: {
  readonly busy: boolean;
  readonly onAdd: () => void;
  readonly onChooseVault: () => void;
}) {
  // Rolled once per mount, not per render: a line that changed on every keystroke
  // elsewhere in the window would read as a glitch.
  const [line] = useState(() => lineFor(Math.random()));

  return (
    <div className="pane-empty">
      <PixelGhost />

      <p className="pane-empty-line">{line}</p>

      {/* The canvas shows no import control: dropping a file on the window and ⌘O are
          what it offers. This keeps both reachable with a mouse, and says so, because a
          shortcut nobody is told about is a shortcut nobody has. */}
      <p>
        Choose something from the sidebar, make a note there, drop a PDF on the window, or press{" "}
        <span className="kbd">⌘O</span>.
      </p>

      <div className="pane-empty-actions">
        <button className="secondary" disabled={busy} onClick={onAdd} type="button">
          Import a document
        </button>
        <button className="quiet" disabled={busy} onClick={onChooseVault} type="button">
          Open another vault
        </button>
      </div>
    </div>
  );
}
