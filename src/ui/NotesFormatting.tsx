/**
 * The format controls for one editor: docked under the notes' header when opened there,
 * otherwise floating over a selection. Apart from `NotesEditor` so the editor holds the
 * view and this holds what is drawn for it.
 */
import type { EditorView } from "@codemirror/view";
import type { RefObject } from "react";

import { barFor, formatBlock, formatInline, formatLink, formatStateOf, markSelection, paintSelection } from "../notes/markSelection";
import { activeCell, cellFormatting, formatCell } from "../notes/preview/tableCellFormat";
import type { MenuAt } from "./menuPlacement";
import { NotesFormatBar, NotesFormatStrip, type FormatState } from "./NotesFormatBar";

/**
 * What the format controls show: for the table cell being typed in, if there is one, or
 * else for the editor's selection. A block picked with ⋮⋮ puts the bar away: the block's
 * own menu is opening.
 */
export function formatOf(view: EditorView, picked: boolean): { at: MenuAt | null; state: FormatState; selected: boolean; inCell: boolean } {
  return (
    cellFormatting(view) ?? {
      at: picked ? null : barFor(view),
      state: formatStateOf(view),
      selected: !view.state.selection.main.empty,
      inCell: false,
    }
  );
}

export function NotesFormatting({
  view,
  docked,
  at,
  state,
  selected,
  inCell,
  onDismiss,
}: {
  readonly view: RefObject<EditorView | null>;
  /** Opened from the notes' header: shown all the time, and the floating bar is not. */
  readonly docked: boolean;
  /** Where a floating bar goes, or `null` when nothing is selected. */
  readonly at: MenuAt | null;
  readonly state: FormatState;
  readonly selected: boolean;
  /** In a table cell, which takes only inline formats. */
  readonly inCell: boolean;
  readonly onDismiss: () => void;
}) {
  const apply = (act: (editor: EditorView) => void) => () => {
    if (view.current !== null) {
      act(view.current);
    }
  };
  const handlers = {
    state,
    selected,
    inCell,
    onInline: (kind: Parameters<typeof formatInline>[1]) => {
      // In a table cell, on the cell's words (`tableCellFormat.ts`); elsewhere, the notes'.
      apply((editor) => {
        const cell = activeCell(editor);

        if (cell === null) {
          formatInline(editor, kind);
        } else {
          formatCell(editor, cell, kind);
        }
      })();
    },
    onBlock: (kind: Parameters<typeof formatBlock>[1]) => {
      apply((editor) => formatBlock(editor, kind))();
    },
    onLink: apply(formatLink),
    onHighlight: (semantic: Parameters<typeof markSelection>[1]) => {
      apply((editor) => markSelection(editor, semantic))();
    },
    onPaint: (paint: Parameters<typeof paintSelection>[1]) => {
      apply((editor) => paintSelection(editor, paint))();
    },
  };

  if (docked) {
    return <NotesFormatStrip {...handlers} />;
  }

  return at === null ? null : <NotesFormatBar at={at} onDismiss={onDismiss} {...handlers} />;
}
