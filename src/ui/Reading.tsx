/**
 * A lecture open: the document, and the notes beside it.
 *
 * The one place that holds both, because the two links between them cross here.
 * "Link to notes" starts in the document — a highlight to cite — and ends at the cursor
 * in the notes; a `cite://` badge starts in the notes and ends at a highlight on a page.
 * Neither side knows the other; each is handed a function.
 *
 * The notes stay mounted while hidden, so hiding and showing them never costs the
 * cursor or the undo history. ⌘\ toggles them, as `claude-spec.md` §2.3 names.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { Annotation } from "../ipc/annotations";
import type { OpenedDocument } from "../ipc/document";
import { citationBlock } from "../notes/citation";
import type { NotesHandle } from "./NotesEditor";
import { NotesPane } from "./NotesPane";
import { PdfViewer } from "./PdfViewer";
import type { Jump } from "./useJump";
import { useMetaShortcut } from "./useMetaShortcut";

export function Reading({
  document,
  title,
  vault,
  directory,
  onClose,
}: {
  readonly document: OpenedDocument;
  readonly title: string;
  readonly vault: string;
  readonly directory: string;
  readonly onClose: () => void;
}) {
  const notes = useRef<NotesHandle | null>(null);
  const [notesOpen, setNotesOpen] = useState(true);
  const [jump, setJump] = useState<Jump | null>(null);

  // Citations made before the editor exists — the notes still loading — wait here rather
  // than being dropped.
  const waiting = useRef<string[]>([]);

  // A jump belongs to the lecture it was made in.
  useEffect(() => {
    setJump(null);
    waiting.current = [];
  }, [directory]);

  const link = useCallback((annotation: Annotation) => {
    const block = citationBlock(annotation);

    setNotesOpen(true);

    if (notes.current === null) {
      waiting.current.push(block);
      return;
    }

    notes.current.insertCitation(block);
  }, []);

  const ready = useCallback(() => {
    const queued = waiting.current.splice(0);

    for (const block of queued) {
      notes.current?.insertCitation(block);
    }
  }, []);

  const cite = useCallback((id: string) => {
    setJump((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  const toggleNotes = useCallback(() => {
    setNotesOpen((open) => !open);
  }, []);

  useMetaShortcut("\\", true, toggleNotes);

  return (
    <div className="reading">
      <PdfViewer
        directory={directory}
        document={document}
        jump={jump}
        notesOpen={notesOpen}
        onClose={onClose}
        onLinkToNotes={link}
        onNotes={toggleNotes}
        title={title}
        vault={vault}
      />
      <NotesPane
        directory={directory}
        handle={notes}
        hidden={!notesOpen}
        onCite={cite}
        onHide={() => {
          setNotesOpen(false);
        }}
        onReady={ready}
        vault={vault}
      />
    </div>
  );
}
