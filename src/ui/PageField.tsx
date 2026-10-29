/**
 * The page number you can type into.
 *
 * # Why it keeps a draft
 *
 * Reported 2026-10-29: the field did nothing in scroll mode. It was controlled entirely by
 * the page being shown, and in scroll mode that number is *derived from the scroll offset*
 * — so a keystroke asked for a smooth scroll, the offset had not moved yet when React
 * re-rendered, and the field snapped straight back to the old number. The second digit of
 * "15" could never be typed. Page mode hid the bug because the index is state there and
 * updates synchronously.
 *
 * So while it has focus the field holds what was typed, and commits on Enter or on blur.
 * That also fixes something page mode did wrong quietly: navigating on every keystroke
 * meant typing "15" jumped to page 1 on the way past.
 *
 * Escape abandons the draft, for the same reason the highlight menu takes Escape — a
 * control that can be opened by mistake needs a way out that is not "undo what it did".
 */
import { useState } from "react";

export function PageField({
  showing,
  pages,
  onGoTo,
}: {
  /** Zero-based, as everything inside the viewer is. */
  readonly showing: number;
  readonly pages: number;
  readonly onGoTo: (index: number) => void;
}) {
  // `null` means "follow the document". A string rather than a number because a
  // half-typed field is legitimately not a number yet, and "" is a state someone passes
  // through on the way to typing anything at all.
  const [draft, setDraft] = useState<string | null>(null);
  const empty = pages === 0;

  const commit = (text: string) => {
    const asked = Number.parseInt(text, 10);

    setDraft(null);

    // A page past either end is clamped rather than refused: someone typing 99 in a
    // 19-page document means the end, and an error message would be a strange answer to
    // a question that has an obvious one. A field left blank or unparseable just reverts.
    if (Number.isInteger(asked)) {
      onGoTo(Math.min(Math.max(1, asked), pages) - 1);
    }
  };

  return (
    <input
      disabled={empty}
      id="page-number"
      max={Math.max(1, pages)}
      min={1}
      onBlur={(event) => {
        if (draft !== null) {
          commit(event.target.value);
        }
      }}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit(event.currentTarget.value);
          return;
        }

        if (event.key === "Escape") {
          setDraft(null);
        }
      }}
      type="number"
      value={draft ?? (empty ? "" : String(showing + 1))}
    />
  );
}
