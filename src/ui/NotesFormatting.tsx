/**
 * The format controls for one editor: docked under the notes' header when opened there,
 * otherwise floating over a selection. Apart from `NotesEditor` so the editor holds the
 * view and this holds what is drawn for it.
 */
import type { EditorView } from "@codemirror/view";
import type { RefObject } from "react";

import { formatBlock, formatInline, formatLink, markSelection } from "../notes/markSelection";
import type { MenuAt } from "./menuPlacement";
import { NotesFormatBar, NotesFormatStrip, type FormatState } from "./NotesFormatBar";

export function NotesFormatting({
  view,
  docked,
  at,
  state,
  selected,
  onDismiss,
}: {
  readonly view: RefObject<EditorView | null>;
  /** Opened from the notes' header: shown all the time, and the floating bar is not. */
  readonly docked: boolean;
  /** Where a floating bar goes, or `null` when nothing is selected. */
  readonly at: MenuAt | null;
  readonly state: FormatState;
  readonly selected: boolean;
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
    onInline: (kind: Parameters<typeof formatInline>[1]) => {
      apply((editor) => formatInline(editor, kind))();
    },
    onBlock: (kind: Parameters<typeof formatBlock>[1]) => {
      apply((editor) => formatBlock(editor, kind))();
    },
    onLink: apply(formatLink),
    onHighlight: (semantic: Parameters<typeof markSelection>[1]) => {
      apply((editor) => markSelection(editor, semantic))();
    },
  };

  if (docked) {
    return <NotesFormatStrip {...handlers} />;
  }

  return at === null ? null : <NotesFormatBar at={at} onDismiss={onDismiss} {...handlers} />;
}
