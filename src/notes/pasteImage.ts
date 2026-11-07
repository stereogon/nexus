/**
 * Pasting an image into the notes: kept first, then linked where it was pasted.
 *
 * Keeping it is a round trip to the vault, and the link used to go wherever the cursor was
 * once it came back — so typing on straight after a paste put the image mid-sentence, at
 * the point typed to (found by the paste journey under load, 2026-11-07). The spot is now
 * held as a marker the editor carries through every edit made meanwhile (CodeMirror's
 * mapped ranges), and the link lands there. The cursor follows it only if it has not
 * moved since.
 */
import { RangeSet, RangeValue, StateEffect, StateField, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** Where a pasted image is waiting to be linked. */
class Spot extends RangeValue {
  // Before anything typed at the same place afterwards: the image goes where it was pasted.
  override startSide = -1;
  override point = true;

  constructor(readonly id: number) {
    super();
  }

  override eq(other: RangeValue): boolean {
    return other instanceof Spot && other.id === this.id;
  }
}

const hold = StateEffect.define<{ readonly id: number; readonly at: number }>();
const release = StateEffect.define<number>();

const spots = StateField.define<RangeSet<Spot>>({
  create: () => RangeSet.empty,
  update(set, transaction) {
    let next = set.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(hold)) {
        next = next.update({ add: [new Spot(effect.value.id).range(effect.value.at)] });
      } else if (effect.is(release)) {
        const id = effect.value;

        next = next.update({ filter: (_from, _to, spot) => spot.id !== id });
      }
    }

    return next;
  },
});

function spotOf(state: EditorState, id: number): number | null {
  let found: number | null = null;

  state.field(spots).between(0, state.doc.length, (from, _to, spot) => {
    if (spot.id === id) {
      found = from;
      return false;
    }

    return undefined;
  });

  return found;
}

/**
 * The paste handler: an image on the clipboard is handed to `keep`, which resolves to the
 * path to link or `null` if it was not kept (and has said why). Anything else is left to
 * the editor's own paste.
 */
export function pasteImages(keep: () => (file: File) => Promise<string | null>) {
  let next = 0;

  return [
    spots,
    EditorView.domEventHandlers({
      paste(event, view) {
        const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"));

        if (file === undefined) {
          return false;
        }

        // Ours, not the browser's: the browser would paste nothing, or a file name.
        event.preventDefault();

        next += 1;
        const id = next;
        const { from, to } = view.state.selection.main;

        // What was selected is replaced, as any paste replaces it; the spot holds its place.
        view.dispatch({ changes: { from, to, insert: "" }, effects: hold.of({ id, at: from }) });

        void keep()(file).then((path) => {
          // The notes may have been closed while the image was being kept.
          if (!view.dom.isConnected) {
            return;
          }

          const at = spotOf(view.state, id);

          if (path === null || at === null) {
            view.dispatch({ effects: release.of(id) });
            return;
          }

          const link = `![](${path})`;
          const cursor = view.state.selection.main;
          const follows = cursor.empty && cursor.head === at;

          view.dispatch({
            changes: { from: at, insert: link },
            effects: release.of(id),
            ...(follows ? { selection: { anchor: at + link.length } } : {}),
          });
        });

        return true;
      },
    }),
  ];
}
