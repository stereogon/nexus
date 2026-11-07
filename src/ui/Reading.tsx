/**
 * A lecture open: the document, and the notes beside it.
 *
 * The one place that holds both, because the two links between them cross here.
 * "Link to notes" starts in the document — a highlight to cite — and ends at the cursor
 * in the notes; a `cite://` badge starts in the notes and ends at a highlight on a page.
 * Neither side knows the other; each is handed a function.
 *
 * The notes stay mounted while hidden, so hiding and showing them never costs the
 * cursor or the undo history. ⌘\ toggles them, as `claude-spec.md` §2.3 names, and the
 * divider between the two sets how wide they are.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { Annotation } from "../ipc/annotations";
import type { OpenedDocument } from "../ipc/document";
import { citationBlock } from "../notes/citation";
import type { PageHeading } from "../notes/pageHeading";
import { parentOf, spoken } from "./folders";
import { PaneDivider } from "./PaneDivider";
import type { NotesHandle } from "./NotesEditor";
import { NotesPane } from "./NotesPane";
import { PdfViewer } from "./PdfViewer";
import type { Jump } from "./useJump";
import type { Arrival } from "./useArrival";
import { useMetaShortcut } from "./useMetaShortcut";
import { useNotesWidth } from "./useNotesWidth";

export function Reading({
  document,
  title,
  heading,
  vault,
  directory,
  onClose,
  arrival,
}: {
  /** `null` for a plain note: its notes are then the whole pane. */
  readonly document: OpenedDocument | null;
  readonly title: string;
  /** The notes' title and the line under it. */
  readonly heading: PageHeading;
  readonly vault: string;
  readonly directory: string;
  readonly onClose: () => void;
  /** A place to go in this lecture, from a search result or the highlights library. */
  readonly arrival: Arrival | null;
}) {
  const notes = useRef<NotesHandle | null>(null);
  const area = useRef<HTMLDivElement | null>(null);
  const sizing = useNotesWidth(area);
  const [notesOpen, setNotesOpen] = useState(true);
  const [jump, setJump] = useState<Jump | null>(null);
  const [cited, setCited] = useState<ReadonlySet<string>>(new Set());
  const [reveal, setReveal] = useState<{ readonly id: string; readonly nonce: number } | null>(null);

  // Citations made before the editor exists — the notes still loading — wait here rather
  // than being dropped.
  const waiting = useRef<string[]>([]);
  // Which lecture's notes the editor holds, as state so an arrival waiting for them runs
  // once they settle; and the arrival already acted on, so it is not acted on twice.
  const [notesReadyFor, setNotesReadyFor] = useState<string | null>(null);
  const arrived = useRef<number | null>(null);

  // A jump belongs to the lecture it was made in. Only on a real change of lecture: in
  // development React runs effects twice on mount, and a second reset would wipe the jump
  // an arrival had just made.
  const lastDirectory = useRef(directory);

  useEffect(() => {
    if (lastDirectory.current === directory) {
      return;
    }

    lastDirectory.current = directory;
    setJump(null);
    setReveal(null);
    waiting.current = [];
  }, [directory]);

  // After the reset above, so an arrival made with the lecture's opening survives it.
  //
  // A line waits for the editor to hold this lecture's notes, read as state rather than
  // from the moment the editor says it is ready: in development React mounts the editor
  // twice, and a line shown in the first, discarded view was lost (found by the journey).
  useEffect(() => {
    if (arrival === null || arrival.directory !== directory || arrived.current === arrival.nonce) {
      return;
    }

    if (arrival.target.kind === "highlight") {
      const id = arrival.target.id;

      arrived.current = arrival.nonce;
      setJump((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
      return;
    }

    setNotesOpen(true);

    if (notesReadyFor === directory) {
      arrived.current = arrival.nonce;
      notes.current?.showLine(arrival.target.line);
    }
  }, [arrival, directory, notesReadyFor]);

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

    setNotesReadyFor(directory);
  }, [directory]);

  const cite = useCallback((id: string) => {
    setJump((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  // From a highlight to the notes: show them if hidden, and the line citing it.
  const showInNotes = useCallback((id: string) => {
    setNotesOpen(true);
    setReveal((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  const toggleNotes = useCallback(() => {
    setNotesOpen((open) => !open);
  }, []);

  // Nothing to hide the notes beside when they are all there is.
  useMetaShortcut("\\", document !== null, toggleNotes);

  if (document === null) {
    return (
      <div className="reading" ref={area}>
        <NotesPane
          heading={heading}
          alone={{ title, place: spoken(parentOf(directory)), onClose }}
          directory={directory}
          handle={notes}
          hidden={false}
          onCite={cite}
          onCited={setCited}
          onHide={onClose}
          onReady={ready}
          reveal={reveal}
          vault={vault}
          width={null}
        />
      </div>
    );
  }

  return (
    <div className="reading" ref={area}>
      <PdfViewer
        directory={directory}
        document={document}
        jump={jump}
        notesLink={{ cited, show: showInNotes }}
        notesOpen={notesOpen}
        onClose={onClose}
        onLinkToNotes={link}
        onNotes={toggleNotes}
        title={title}
        vault={vault}
      />
      {notesOpen && <PaneDivider label="Notes width" sizing={sizing} title="Drag to resize the notes" />}
      <NotesPane
        heading={heading}
        directory={directory}
        handle={notes}
        hidden={!notesOpen}
        onCite={cite}
        onCited={setCited}
        onHide={() => {
          setNotesOpen(false);
        }}
        onReady={ready}
        reveal={reveal}
        vault={vault}
        width={sizing.width}
        alone={null}
      />
    </div>
  );
}
