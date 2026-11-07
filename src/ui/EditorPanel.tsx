/**
 * The item editor, as a panel beside whatever is open.
 *
 * # Why a panel and not an overlay
 *
 * Reported 2026-10-29: the editor only rendered in the branch that draws the empty pane,
 * so pressing Edit with a lecture open set the state and showed nothing — you had to go
 * back to the vault to find the form you had already asked for.
 *
 * Either an overlay or a panel fixes that. A panel wins because of *what* this form is
 * for: the fields are the item's title and number, and the thing that tells you what they
 * should be is usually the title slide. An overlay would cover the
 * one document you are reading the answers off. The panel is a flex sibling of the
 * viewer rather than floating above it, so the page narrows and re-fits instead of being
 * hidden — the viewer already observes its own width, so nothing there had to change.
 *
 * Not a modal, and deliberately so. The document stays scrollable and selectable while
 * this is open, which is the point of keeping it on screen. So it is an `aside` labelled
 * by its heading rather than a `dialog`, and there is no focus trap: trapping focus
 * inside a panel whose whole purpose is to sit beside something you can still use would
 * be a lie told to a screen reader.
 *
 * The canvas has no artboard for the editor in either form, so this is designed here on
 * purpose rather than by default, and is recorded in `PROGRESS.md` as owing one.
 */
import { useEffect, useRef } from "react";

import type { LectureEdit, LectureRow } from "../ipc/vault";
import { LectureEditor } from "./LectureEditor";

export function EditorPanel({
  busy,
  lecture,
  folders,
  vaultName,
  onCancel,
  onSave,
}: {
  readonly busy: boolean;
  readonly lecture: LectureRow;
  readonly folders: readonly string[];
  readonly vaultName: string;
  readonly onCancel: () => void;
  readonly onSave: (edit: LectureEdit, folder: string) => void;
}) {
  const panel = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  useEffect(() => {
    // Where focus was before the panel opened, so it can be put back. The panel appears
    // far from the control that opened it, and a keyboard user left on `body` afterwards
    // has to tab in from the top of the window to get anywhere.
    const came = document.activeElement;
    const first = panel.current?.querySelector("input");

    // Narrowed rather than asserted: `querySelector` says `Element | null`, and the form
    // having a text field first is a fact about another component, not a guarantee.
    if (first instanceof HTMLInputElement) {
      first.focus();
      first.select();
    }

    return () => {
      if (came instanceof HTMLElement && came.isConnected) {
        came.focus();
      }
    };
    // Once per item: re-running on every render would steal the caret back to the
    // title field on every keystroke, and re-running on `busy` would do it on every save.
  }, [lecture.directory]);

  return (
    <aside aria-labelledby="editor-panel-heading" className="side-panel" ref={panel}>
      <header className="side-panel-head">
        <h2 id="editor-panel-heading">{lecture.kind === "note" ? "Edit note" : "Edit document"}</h2>
        <button
          aria-label="Close the editor"
          className="side-panel-close"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          ✕
        </button>
      </header>

      {/* The title is shown rather than assumed: with a document open, the item being
          edited is often not the one on screen. */}
      <p className="editor-panel-subject">{lecture.title}</p>

      <LectureEditor
        busy={busy}
        folders={folders}
        key={lecture.directory}
        lecture={lecture}
        vaultName={vaultName}
        onCancel={onCancel}
        onSave={onSave}
      />
    </aside>
  );
}
