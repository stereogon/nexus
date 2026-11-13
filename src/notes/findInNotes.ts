/**
 * Find and replace in the notes (2026-11-13).
 *
 * The state is a CodeMirror field — what is being looked for, every match, and which one is
 * selected — so it follows the text as it changes, and the matches are drawn as marks on it.
 * The match being looked at is the editor's selection, as in CodeMirror's own search, so
 * Replace changes exactly what is shown selected and ⌘Z undoes it as any edit. Written here
 * rather than taken from `@codemirror/search`, whose panel would need restyling to match the
 * document's find bar, for a plain case-blind search that is a few lines of its own.
 *
 * It searches the Markdown, so words in bold are found and hidden marks are not in the way of
 * a search for them; words split by a mark (`**bo**ld`) are found as written.
 */
import { EditorSelection, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap } from "@codemirror/view";

export interface Match {
  readonly from: number;
  readonly to: number;
}

/** The find bar's state: `null` while it is closed. */
export interface NotesFind {
  readonly query: string;
  readonly matches: readonly Match[];
  /** Which match is selected, if one is. */
  readonly current: number | null;
  /** Counts each time the bar is asked for, so asking again puts the typing back in it. */
  readonly opened: number;
}

/** Every place `query` is written in `doc`, ignoring case. */
export function matchesOf(doc: string, query: string): Match[] {
  if (query === "") {
    return [];
  }

  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");

  return [...doc.matchAll(pattern)].map((match) => ({ from: match.index, to: match.index + match[0].length }));
}

/** Opens the bar looking for a query, or closes it with `null`. */
export const setFind = StateEffect.define<{ readonly query: string; readonly open: boolean } | null>();

function withSelection(state: EditorState, query: string, matches: readonly Match[], opened: number): NotesFind {
  const { from, to } = state.selection.main;
  const current = matches.findIndex((match) => match.from === from && match.to === to);

  return { query, matches, current: current < 0 ? null : current, opened };
}

const matchMark = Decoration.mark({ class: "md-find" });
const currentMark = Decoration.mark({ class: "md-find md-find-current" });

export const notesFind = StateField.define<NotesFind | null>({
  create: () => null,
  update(value, transaction) {
    let next: NotesFind | null = value;

    for (const effect of transaction.effects) {
      if (effect.is(setFind)) {
        const opened = (value?.opened ?? 0) + (effect.value?.open === true ? 1 : 0);

        next = effect.value === null ? null : { query: effect.value.query, matches: [], current: null, opened };
      }
    }

    if (next === null) {
      return null;
    }

    if (next === value && !transaction.docChanged && transaction.selection === undefined) {
      return value;
    }

    const searched = next === value && !transaction.docChanged;
    const matches = searched ? next.matches : matchesOf(transaction.state.doc.toString(), next.query);

    return withSelection(transaction.state, next.query, matches, next.opened);
  },
  provide: (field) =>
    EditorView.decorations.from(field, (find) =>
      Decoration.set(
        (find?.matches ?? []).map((match, index) => (index === find?.current ? currentMark : matchMark).range(match.from, match.to)),
      ),
    ),
});

/** Selects `match` and brings it into view. */
function select(view: EditorView, match: Match): void {
  view.dispatch({
    selection: EditorSelection.single(match.from, match.to),
    effects: EditorView.scrollIntoView(match.from, { y: "center" }),
  });
}

/** Selects the next match after the selection (`1`) or the one before it (`-1`), round the end. */
export function stepFind(view: EditorView, by: 1 | -1): boolean {
  const { from, to } = view.state.selection.main;
  const matches = view.state.field(notesFind, false)?.matches ?? [];
  const next =
    by > 0
      ? (matches.find((match) => match.from >= to && match.to > from) ?? matches[0])
      : ([...matches].reverse().find((match) => match.to <= from && match.from < to) ?? matches[matches.length - 1]);

  if (next !== undefined) {
    select(view, next);
  }

  return next !== undefined;
}

/** Looks for `query` as it is typed, selecting the first match from where the selection starts. */
export function searchFor(view: EditorView, query: string): void {
  const { from } = view.state.selection.main;

  view.dispatch({ effects: setFind.of({ query, open: false }) });

  const matches = view.state.field(notesFind, false)?.matches ?? [];
  const first = matches.find((match) => match.from >= from) ?? matches[0];

  if (first !== undefined) {
    select(view, first);
  }
}

/** Closes the bar, the selected match left selected. */
export function closeFind(view: EditorView): boolean {
  if (view.state.field(notesFind, false) === null) {
    return false;
  }

  view.dispatch({ effects: setFind.of(null) });

  return true;
}

/** Replaces the selected match and selects the next; with none selected, selects the next. */
export function replaceMatch(view: EditorView, replacement: string): void {
  const find = view.state.field(notesFind, false);
  const current = find?.current ?? null;
  const match = current === null ? undefined : find?.matches[current];

  if (match !== undefined) {
    view.dispatch({
      changes: { from: match.from, to: match.to, insert: replacement },
      selection: { anchor: match.from + replacement.length },
      userEvent: "input.replace",
    });
  }

  stepFind(view, 1);
}

/** Replaces every match, in one change that one ⌘Z undoes; how many it replaced. */
export function replaceAll(view: EditorView, replacement: string): number {
  const matches = view.state.field(notesFind, false)?.matches ?? [];

  if (matches.length > 0) {
    view.dispatch({
      changes: matches.map((match) => ({ from: match.from, to: match.to, insert: replacement })),
      userEvent: "input.replace.all",
    });
  }

  return matches.length;
}

/**
 * Opens the bar: looking for the selected words if a few are selected on one line, or else
 * for what it last looked for.
 */
export function openFind(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const query = from < to && !selected.includes("\n") ? selected : (view.state.field(notesFind, false)?.query ?? "");

  view.dispatch({ effects: setFind.of({ query, open: true }) });

  return true;
}

/** The field; ⌘F in the notes opens the bar, ahead of the document's own ⌘F, and Escape closes it. */
export const findInNotes: Extension = [
  notesFind,
  keymap.of([
    { key: "Mod-f", run: openFind },
    { key: "Escape", run: closeFind },
  ]),
];
