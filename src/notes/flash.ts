/**
 * A brief highlight on one line of the notes, after a jump from the document.
 *
 * `claude-spec.md` §2.4: clicking the link indicator on a highlight scrolls the editor to
 * the line citing it "and highlights the note block". The line gets a class whose CSS
 * animation fades by itself; the class alternates between two names so a second jump to
 * the same line restarts the animation rather than finding it already finished.
 */
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

/** Flash the line containing this offset. */
export const flashLine = StateEffect.define<number>();

export const lineFlash = StateField.define<{ readonly flips: number; readonly decorations: DecorationSet }>({
  create: () => ({ flips: 0, decorations: Decoration.none }),
  update(current, transaction) {
    let next = { ...current, decorations: current.decorations.map(transaction.changes) };

    for (const effect of transaction.effects) {
      if (effect.is(flashLine)) {
        const flips = current.flips + 1;
        const line = transaction.state.doc.lineAt(Math.min(effect.value, transaction.state.doc.length));

        next = {
          flips,
          decorations: Decoration.set([
            Decoration.line({ class: flips % 2 === 0 ? "md-flash-a" : "md-flash-b" }).range(line.from),
          ]),
        };
      }
    }

    return next;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});
