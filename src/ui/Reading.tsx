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
 *
 * The notes pane shows the item's own notes or one of its pages (2026-11-14,
 * `useItemPages`). A highlight counts as cited wherever its citation lives, and "show in
 * notes" opens the note that cites it; "Link to notes" cites into the note on screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { Annotation } from "../ipc/annotations";
import type { OpenedDocument } from "../ipc/document";
import { citationBlock } from "../notes/citation";
import { headingMeta, type PageHeading } from "../notes/pageHeading";
import { parentOf, spoken } from "./folders";
import { PaneDivider } from "./PaneDivider";
import type { NotesHandle } from "./NotesEditor";
import { NotesPane } from "./NotesPane";
import { PdfViewer } from "./PdfViewer";
import type { Jump } from "./useJump";
import type { Arrival } from "./useArrival";
import { useMetaShortcut } from "./useMetaShortcut";
import { useNotesWidth } from "./useNotesWidth";
import { noteCiting, pathTo, type NoteKey } from "./pageTree";
import { useItemPages } from "./useItemPages";

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
  const item = useItemPages(vault, directory);
  const { open: openNote, openNote: showNote, cites } = item;
  const [reveal, setReveal] = useState<{ readonly id: string; readonly nonce: number } | null>(null);

  // Citations made before the editor exists — the notes still loading — wait here rather
  // than being dropped.
  const waiting = useRef<string[]>([]);
  // A citation to show once the note citing it has opened.
  const revealing = useRef<string | null>(null);
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
    revealing.current = null;
  }, [directory]);

  // Which note the editor holds, as `notesReadyFor` records it.
  const here = `${directory}#${openNote ?? ""}`;

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

    const target = arrival.target;
    const wanted: NoteKey = target.kind === "page" ? target.page : null;

    if (openNote !== wanted) {
      showNote(wanted);
      return;
    }

    if (notesReadyFor === here) {
      arrived.current = arrival.nonce;

      if (target.line !== null) {
        notes.current?.showLine(target.line);
      }
    }
  }, [arrival, directory, notesReadyFor, here, openNote, showNote]);

  const link = useCallback((annotation: Annotation) => {
    const block = citationBlock(annotation);

    setNotesOpen(true);

    if (notes.current === null) {
      waiting.current.push(block);
      return;
    }

    notes.current.insertBlock(block);
  }, []);

  const ready = useCallback(() => {
    const queued = waiting.current.splice(0);

    for (const block of queued) {
      notes.current?.insertBlock(block);
    }

    setNotesReadyFor(here);

    if (revealing.current !== null) {
      const id = revealing.current;

      revealing.current = null;
      setReveal((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
    }
  }, [here]);

  const cite = useCallback((id: string) => {
    setJump((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  // From a highlight to the notes: show them if hidden, and the line citing it.
  const showInNotes = useCallback(
    (id: string) => {
      const citing = noteCiting(cites, id, openNote);

      setNotesOpen(true);

      // Cited in another of the item's notes: open that one, and show it once it is ready.
      if (citing !== undefined && citing !== openNote) {
        revealing.current = id;
        showNote(citing);
        return;
      }

      setReveal((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
    },
    [cites, openNote, showNote],
  );

  // A page's heading is its own: its name, when it was made, and the note it is in.
  const path = openNote === null ? [] : pathTo(item.pages, openNote);
  const page = path.at(-1);
  const noteHeading: PageHeading =
    page === undefined
      ? heading
      : { title: page.title, meta: headingMeta(page.created, []), up: path.at(-2)?.title ?? title };

  // The document hidden and its notes shown alone, as a page (2026-11-09); side by side is
  // the default. The notes pane stays the same component throughout, so the cursor, the
  // undo history and where the notes were scrolled survive the change.
  const [documentShown, setDocumentShown] = useState(true);

  const toggleNotes = useCallback(() => {
    if (documentShown) {
      setNotesOpen((open) => !open);
    } else {
      // From the notes alone, ⌘\ brings the document back rather than hiding all there is.
      setDocumentShown(true);
    }
  }, [documentShown]);

  // Nothing to hide the notes beside when they are all there is.
  useMetaShortcut("\\", document !== null, toggleNotes);

  if (document === null) {
    return (
      <div className="reading" ref={area}>
        <NotesPane
          heading={noteHeading}
          item={item}
          itemTitle={title}
          alone={{ title, place: spoken(parentOf(directory)), onClose }}
          directory={directory}
          handle={notes}
          hidden={false}
          onCite={cite}
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
      {documentShown && (
        <PdfViewer
          directory={directory}
          document={document}
          jump={jump}
          notesLink={{ cited: item.cited, show: showInNotes }}
          notesOpen={notesOpen}
          onClose={onClose}
          onLinkToNotes={link}
          onNotes={toggleNotes}
          title={title}
          vault={vault}
        />
      )}
      {documentShown && notesOpen && <PaneDivider label="Notes width" sizing={sizing} title="Drag to resize the notes" />}
      <NotesPane
        heading={noteHeading}
        item={item}
        itemTitle={title}
        directory={directory}
        handle={notes}
        hidden={documentShown && !notesOpen}
        onNotesOnly={() => {
          setNotesOpen(true);
          setDocumentShown(false);
        }}
        onCite={cite}
        onHide={() => {
          setNotesOpen(false);
        }}
        onReady={ready}
        reveal={reveal}
        vault={vault}
        width={documentShown ? sizing.width : null}
        alone={
          documentShown
            ? null
            : {
                title,
                place: spoken(parentOf(directory)),
                onClose,
                onShowDocument: () => {
                  setDocumentShown(true);
                },
              }
        }
      />
    </div>
  );
}
