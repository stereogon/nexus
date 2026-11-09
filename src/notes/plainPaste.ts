/**
 * ⌘⇧V pastes the clipboard as plain text (2026-11-09), as every Mac app's Paste and Match
 * Style does: the words alone, none of the formatting `richPaste.ts` would turn into
 * Markdown. The clipboard is read natively (`ipc/clipboard.ts`), since WebKit does not
 * make ⌘⇧V a paste.
 *
 * The text goes where the selection is when it arrives, replacing what is selected then,
 * as an ordinary paste would; the read is quick, and a cursor moved meanwhile was moved on
 * purpose.
 */
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

export function plainPaste(read: () => Promise<string | null>) {
  return Prec.high(
    keymap.of([
      {
        key: "Mod-Shift-v",
        preventDefault: true,
        run(view) {
          void read().then((text) => {
            // Nothing to paste, or the notes closed while it was read.
            if (text === null || text === "" || !view.dom.isConnected) {
              return;
            }

            const { from, to } = view.state.selection.main;

            view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true, userEvent: "input.paste" });
          });

          return true;
        },
      },
    ]),
  );
}
