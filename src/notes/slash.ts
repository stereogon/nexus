/**
 * The "/" menu (2026-11-09), as Notion's: typing "/" at the start of a line or after a
 * space opens a list of blocks at the cursor, the words typed after it narrow the list,
 * ↑ and ↓ choose, Enter or Tab takes the choice, Escape closes it with the text kept.
 *
 * The session lives in the editor's state — where the "/" is and what follows it — so it
 * moves with edits and ends by itself when the cursor leaves it. What the menu offers is
 * passed in (`+`'s items, `ui/blockMenus.ts`), so this knows nothing of the window.
 */
import { syntaxTree } from "@codemirror/language";
import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

export interface SlashItem {
  readonly label: string;
  readonly onSelect: () => void;
}

export interface SlashSession {
  /** Where the "/" is. */
  readonly from: number;
  /** What has been typed after it. */
  readonly query: string;
  /** The chosen item, among the matching ones. */
  readonly active: number;
}

const setSession = StateEffect.define<SlashSession | null>();

/** The longest query before the menu gives up: by then it is prose, not a search. */
const LONGEST = 24;

export const slashSession = StateField.define<SlashSession | null>({
  create: () => null,
  update(session, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSession)) {
        return effect.value;
      }
    }

    if (session === null || (!transaction.docChanged && transaction.selection === undefined)) {
      return session;
    }

    const { doc, selection } = transaction.state;
    const from = transaction.changes.mapPos(session.from, 1);
    const head = selection.main.head;

    // Over when the "/" is gone, or the cursor leaves the words after it.
    if (doc.sliceString(from, from + 1) !== "/" || !selection.main.empty || head <= from || doc.lineAt(head).from !== doc.lineAt(from).from) {
      return null;
    }

    const query = doc.sliceString(from + 1, head);

    if (query.length > LONGEST || /^\s|\s\s/u.test(query)) {
      return null;
    }

    return { from, query, active: query === session.query ? session.active : 0 };
  },
});

/** The items matching `query`, those starting with it first. */
export function matching<T extends SlashItem>(items: readonly T[], query: string): T[] {
  const wanted = query.trim().toLowerCase();
  const found = items.filter((item) => item.label.toLowerCase().includes(wanted));

  return [...found.filter((item) => item.label.toLowerCase().startsWith(wanted)), ...found.filter((item) => !item.label.toLowerCase().startsWith(wanted))];
}

function inCode(state: EditorState, at: number): boolean {
  for (let node = syntaxTree(state).resolveInner(at, -1); ; ) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" || node.name === "InlineCode") {
      return true;
    }

    const parent = node.parent;

    if (parent === null) {
      return false;
    }

    node = parent;
  }
}

/** Takes `item`: the "/" and what follows it go, then the item acts on the line. */
export function chooseSlash(view: EditorView, item: SlashItem): void {
  const session = view.state.field(slashSession, false) ?? null;

  if (session === null) {
    return;
  }

  view.dispatch({
    changes: { from: session.from, to: view.state.selection.main.head },
    selection: { anchor: session.from },
    effects: setSession.of(null),
  });
  item.onSelect();
}

/** The "/" menu's state and keys. `items` is what it offers, for the editor at hand. */
export function slashCommands(items: (view: EditorView) => readonly SlashItem[]): Extension {
  const shown = (view: EditorView) => {
    const session = view.state.field(slashSession, false) ?? null;

    return session === null ? null : { session, found: matching(items(view), session.query) };
  };
  const step = (by: 1 | -1) => (view: EditorView) => {
    const open = shown(view);

    if (open === null || open.found.length === 0) {
      return false;
    }

    const active = (open.session.active + by + open.found.length) % open.found.length;

    view.dispatch({ effects: setSession.of({ ...open.session, active }) });
    return true;
  };
  const take = (view: EditorView) => {
    const open = shown(view);
    const item = open?.found[open.session.active];

    if (item === undefined) {
      return false;
    }

    chooseSlash(view, item);
    return true;
  };

  return [
    slashSession,
    EditorView.inputHandler.of((view, from, to, text) => {
      if (text !== "/" || from !== to || inCode(view.state, from)) {
        return false;
      }

      const before = view.state.sliceDoc(from - 1, from);

      if (from > view.state.doc.lineAt(from).from && !/\s/u.test(before)) {
        return false;
      }

      view.dispatch({
        changes: { from, insert: "/" },
        selection: { anchor: from + 1 },
        effects: setSession.of({ from, query: "", active: 0 }),
        userEvent: "input.type",
      });
      return true;
    }),
    Prec.highest(
      keymap.of([
        { key: "ArrowDown", run: step(1) },
        { key: "ArrowUp", run: step(-1) },
        { key: "Enter", run: take },
        { key: "Tab", run: take },
        {
          key: "Escape",
          run: (view) => {
            if (shown(view) === null) {
              return false;
            }

            view.dispatch({ effects: setSession.of(null) });
            return true;
          },
        },
      ]),
    ),
  ];
}
