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
 * So while it has focus the field holds what was typed, and that draft is what is shown.
 *
 * # Why it still moves as you type
 *
 * The first fix made Enter the only way to commit, and the report came back unchanged:
 * *"i put a number and it is not taking me to the page"*. Requiring Enter was a change in
 * its own right, and an invisible one — nothing on screen says a field needs it.
 *
 * The draft is what makes moving-as-you-type safe now, because the field no longer reads
 * its value back from the page being shown, so a scroll that has not happened yet cannot
 * overwrite what was typed. The cost is an intermediate jump: typing "15" passes through
 * page 1. That is worth paying for a control that responds, and typing a page number is
 * not a thing people do idly.
 *
 * Out-of-range numbers are the exception and wait for Enter or blur. "99" in a 19-page
 * document should not drag the reader to the end while they are still typing — but it
 * should go somewhere sensible once they are done, so the clamp lives at the commit.
 *
 * Escape abandons the draft *and goes back*, which is the only reading of "abandon" that
 * means anything once typing moves the document. Dropping the text while leaving the
 * reader fourteen pages from where they started would be a way out of the field, not a
 * way out of what it did.
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
  // The page that was being read when this draft started, so Escape has somewhere to go
  // back to. Without it, Escape could only drop the text and leave the reader wherever
  // typing had taken them -- which is not abandoning anything.
  const [origin, setOrigin] = useState(showing);
  const empty = pages === 0;

  /** Moves the document, clamping into the document's range. Leaves the draft alone. */
  const navigate = (text: string) => {
    const asked = Number.parseInt(text, 10);

    // A blank or unparseable field goes nowhere. There is no error to show: a half-typed
    // number is not a mistake, it is a number that is not finished.
    if (Number.isInteger(asked)) {
      onGoTo(Math.min(Math.max(1, asked), pages) - 1);
    }
  };

  /** Finishes with the field: move, then follow the document again. */
  const commit = (text: string) => {
    setDraft(null);
    navigate(text);
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
        const typed = event.target.value;
        const asked = Number.parseInt(typed, 10);

        if (draft === null) {
          setOrigin(showing);
        }

        setDraft(typed);

        // Only a page that exists. A number still being typed past the end would
        // otherwise drag the document to the last page on the way through.
        if (Number.isInteger(asked) && asked >= 1 && asked <= pages) {
          navigate(typed);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit(event.currentTarget.value);
          return;
        }

        if (event.key === "Escape") {
          setDraft(null);
          onGoTo(origin);
        }
      }}
      type="number"
      value={draft ?? (empty ? "" : String(showing + 1))}
    />
  );
}
