/**
 * The notes beside the document: a header, what has happened to the last save, and the
 * editor.
 *
 * Styled to sit with the viewer it is next to — the same chrome bar, the same type — and
 * not yet from the canvas. The canvas could not be opened from the account in use when
 * this was built, and the user chose to wire the pane now and restyle it from the
 * artboards once they are readable (2026-11-05). Recorded in `PROGRESS.md` as owing that
 * pass, rather than looking finished.
 */
import { useCallback, useEffect, useRef, useState, type Ref } from "react";

import { saveDroppedImage, saveImage } from "../ipc/assets";
import { asCommandError, type CommandError } from "../ipc/vault";

import { assetUrl } from "../notes/assets";
import type { PageHeading } from "../notes/pageHeading";
import { Failure } from "./Failure";
import { NotesEditor, type NotesHandle } from "./NotesEditor";
import { acceptNotesDrops } from "./notesDrop";
import { NotesHeader, type Alone } from "./NotesHeader";
import { useNotes } from "./useNotes";

/** Why a pasted image was not kept, in words the reader can act on. */
const REFUSED = {
  notAnImage:
    "That was not an image Nexus keeps in notes — PNG, JPEG, GIF and WebP are. Nothing was added.",
  tooLarge: "That image is larger than 25 MB, so it was not added. A screenshot or an exported slide will fit.",
} as const;

/**
 * A dropped file that is not an image is most likely a lecture meant for the vault, landed
 * on the notes by a few pixels — so the sentence says where it should have gone.
 */
const DROP_NOT_AN_IMAGE =
  "That is not an image Nexus keeps in notes — PNG, JPEG, GIF and WebP are — so nothing was added. To import a document, drop it anywhere outside the notes.";


export function NotesPane({
  vault,
  directory,
  handle,
  onCite,
  onHide,
  onReady,
  hidden,
  reveal,
  onCited,
  width,
  alone,
  onNotesOnly,
  heading,
}: {
  readonly vault: string;
  readonly directory: string;
  readonly handle: Ref<NotesHandle>;
  /** A `cite://` badge was clicked. */
  readonly onCite: (id: string) => void;
  readonly onHide: () => void;
  readonly onReady: () => void;
  /** Hidden rather than unmounted, so the cursor and undo history survive. */
  readonly hidden: boolean;
  /** A highlight to show the citation of. */
  readonly reveal: { readonly id: string; readonly nonce: number } | null;
  /** The cited highlights changed. */
  readonly onCited: (ids: ReadonlySet<string>) => void;
  /** The width chosen with the divider, or `null` for the stylesheet's default. */
  readonly width: number | null;
  /**
   * For a plain note, which has no document: the pane is then the whole reading area, its
   * header names the note, and closing it closes the note. `null` beside a document.
   */
  readonly alone: Alone | null;
  /** Beside a document: hides it and keeps the notes, as a page of their own (2026-11-09). */
  readonly onNotesOnly?: () => void;
  /** The title and the line under it, drawn above the writing. */
  readonly heading: PageHeading;
}) {
  const notes = useNotes(vault, directory);

  useEffect(() => {
    onCited(notes.cited);
  }, [notes.cited, onCited]);
  const [pasteProblem, setPasteProblem] = useState<string | null>(null);
  const [pasteFailure, setPasteFailure] = useState<CommandError | null>(null);
  const [dropping, setDropping] = useState(false);
  // The format controls docked open under the header, for choosing a format before writing.
  // Open from the start on a plain note, as the canvas draws one: a note is written, not
  // annotated beside a document, so its formatting is wanted up front.
  const [formatting, setFormatting] = useState(alone !== null);
  const pane = useRef<HTMLElement | null>(null);
  const editor = useRef<NotesHandle | null>(null);

  // The editor's handle, kept here for drops as well as handed up to `Reading`.
  const handles = useCallback(
    (value: NotesHandle | null) => {
      editor.current = value;

      if (typeof handle === "function") {
        handle(value);
      } else if (handle !== null) {
        handle.current = value;
      }
    },
    [handle],
  );

  const pasteImage = useCallback(
    async (file: File): Promise<string | null> => {
      setPasteProblem(null);
      setPasteFailure(null);

      try {
        const saved = await saveImage(vault, directory, new Uint8Array(await file.arrayBuffer()));

        if (saved.outcome === "saved") {
          return saved.path;
        }

        setPasteProblem(REFUSED[saved.reason]);
        return null;
      } catch (thrown: unknown) {
        setPasteFailure(asCommandError(thrown));
        return null;
      }
    },
    [vault, directory],
  );

  // Files dropped on the notes are images for them, kept one by one in the order dropped;
  // anything refused is said once and the rest are still linked.
  useEffect(() => {
    const element = pane.current;

    if (element === null) {
      return undefined;
    }

    return acceptNotesDrops({
      element,
      hover: setDropping,
      drop: (paths, at) => {
        setPasteProblem(null);
        setPasteFailure(null);

        void (async () => {
          const kept: string[] = [];

          try {
            for (const path of paths) {
              const saved = await saveDroppedImage(vault, directory, path);

              if (saved.outcome === "saved") {
                kept.push(saved.path);
              } else {
                setPasteProblem(saved.reason === "notAnImage" ? DROP_NOT_AN_IMAGE : REFUSED.tooLarge);
              }
            }
          } catch (thrown: unknown) {
            setPasteFailure(asCommandError(thrown));
          }

          editor.current?.insertImages(kept, at);
        })();
      },
    });
  }, [vault, directory]);

  return (
    <aside
      aria-label="Notes"
      className={["notes-pane", alone === null ? "" : "alone", dropping ? "dropping" : ""]
        .filter((name) => name !== "")
        .join(" ")}
      // A chosen width replaces the default share and its cap; `useNotesWidth` has already
      // held it to what the window can give.
      data-sized={width === null ? undefined : ""}
      hidden={hidden}
      ref={pane}
      style={width === null ? undefined : { flexBasis: width }}
    >
      <NotesHeader
        alone={alone}
        formatting={formatting}
        onFormatting={() => {
          setFormatting((open) => !open);
        }}
        onHide={onHide}
        onNotesOnly={onNotesOnly}
        status={notes.status}
      />

      {notes.onDisk !== null && (
        <div className="notes-conflict" role="alert">
          <p>
            <strong>notes.md was changed outside Nexus</strong> — on another device or in another
            app — while you were writing here. Your text is still in the editor and has not
            been saved over it.
          </p>
          <details>
            <summary>Show the other version</summary>
            <pre>{notes.onDisk.text === "" ? "(empty)" : notes.onDisk.text}</pre>
          </details>
          <div className="notes-conflict-actions">
            <button onClick={notes.keepMine} type="button">
              Keep mine
            </button>
            <button className="secondary" onClick={notes.takeTheirs} type="button">
              Use the other version
            </button>
          </div>
        </div>
      )}

      {notes.failure !== null && <Failure error={notes.failure} />}
      {pasteFailure !== null && <Failure error={pasteFailure} />}
      {pasteProblem !== null && <p className="note notes-paste-problem">{pasteProblem}</p>}

      {notes.loaded !== null && (
        <NotesEditor
          generation={notes.generation}
          handle={handles}
          onChange={notes.change}
          onCite={onCite}
          imageUrl={(src) => assetUrl(vault, directory, src)}
          onPasteImage={pasteImage}
          // Not withheld while hidden: showing the pane and making the request happen in one
          // React commit, so the pane is visible by the time the editor acts on it. (Tested:
          // the journey that reveals from a hidden pane passes without withholding.)
          reveal={reveal}
          onReady={onReady}
          formatting={formatting}
          page={alone !== null}
          heading={heading}
          text={notes.loaded.text}
        />
      )}
    </aside>
  );
}
