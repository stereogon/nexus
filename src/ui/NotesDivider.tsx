/**
 * The divider between the document and the notes: drag it, or focus it and use the arrows.
 *
 * A `separator` with a value, which is the ARIA pattern for a splitter, so a screen reader
 * announces it as something that moves and how far. The arrow keys move it by one step,
 * or a larger one with Shift; the keyboard is not an afterthought on a control the
 * trackpad would otherwise be the only way to reach.
 *
 * Pointer capture keeps the drag alive when the pointer crosses into the PDF's text layer
 * or the editor, either of which would otherwise start a selection of its own.
 */
import { useState, type KeyboardEvent, type PointerEvent } from "react";

import { KEY_STEP, KEY_STEP_LARGE } from "./notesWidth";
import type { NotesWidth } from "./useNotesWidth";

/** Arrow left widens the notes: the divider moves left, and the notes are on the right. */
const DIRECTION: Readonly<Record<string, -1 | 1>> = { ArrowLeft: -1, ArrowRight: 1 };

export function NotesDivider({ sizing }: { readonly sizing: NotesWidth }) {
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      sizing.moveEdgeTo(event.clientX, false);
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      sizing.moveEdgeTo(event.clientX, true);
      setDragging(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = DIRECTION[event.key];

    if (direction === undefined) {
      return;
    }

    event.preventDefault();

    const edge = event.currentTarget.getBoundingClientRect().left;

    sizing.moveEdgeTo(edge + direction * (event.shiftKey ? KEY_STEP_LARGE : KEY_STEP), true);
  };

  return (
    <div
      aria-label="Notes width"
      aria-orientation="vertical"
      aria-valuemax={sizing.limits?.max}
      aria-valuemin={sizing.limits?.min}
      aria-valuenow={sizing.width ?? undefined}
      className={dragging ? "notes-divider dragging" : "notes-divider"}
      onKeyDown={onKeyDown}
      onLostPointerCapture={() => {
        setDragging(false);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="separator"
      tabIndex={0}
      title="Drag to resize the notes"
    />
  );
}
