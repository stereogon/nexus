/**
 * The sidebar's rows: a folder to step into, an item to open with its edit control, the
 * field that names a new note or folder, and the lists of folders the vault walk could not
 * use. Apart from `Sidebar.tsx` because these draw single rows and need nothing of the
 * sidebar's own state.
 */
import { useState } from "react";

import type { LectureRow, ProblemRow } from "../ipc/vault";
import type { Making, SidebarRow } from "./sidebarRows";

/** The edit control's icon. */
function PencilIcon() {
  return (
    <svg aria-hidden="true" height="13" viewBox="0 0 13 13" width="13">
      <path
        d="M2 11 L2.6 8.6 L8.9 2.3 A1.2 1.2 0 0 1 10.6 4 L4.3 10.3 Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/** Folders and the two kinds of item each carry a shape, so the list reads at a glance. */
function KindIcon({ kind }: { readonly kind: "folder" | "document" | "note" }) {
  const shape = {
    folder:
      "M1.5 3.6 A1.1 1.1 0 0 1 2.6 2.5 L5.1 2.5 L6.2 3.9 L10.4 3.9 A1.1 1.1 0 0 1 11.5 5 L11.5 9.4 A1.1 1.1 0 0 1 10.4 10.5 L2.6 10.5 A1.1 1.1 0 0 1 1.5 9.4 Z",
    document: "M3 1.5 L7.6 1.5 L10 3.9 L10 11.5 L3 11.5 Z M7.6 1.5 L7.6 3.9 L10 3.9",
    note: "M2.5 2 L10.5 2 L10.5 11 L2.5 11 Z M4.5 4.6 L8.5 4.6 M4.5 6.6 L8.5 6.6 M4.5 8.6 L7 8.6",
  }[kind];

  return (
    <svg aria-hidden="true" className="row-kind" data-kind={kind} height="13" viewBox="0 0 13 13" width="13">
      <path d={shape} fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.1" />
    </svg>
  );
}

export function Folder({
  row,
  busy,
  onFolder,
}: {
  readonly row: Extract<SidebarRow, { kind: "folder" }>;
  readonly busy: boolean;
  readonly onFolder: (path: string) => void;
}) {
  return (
    <div className="lecture-row">
      <button
        aria-label={row.location === "" ? `Folder ${row.name}` : `Folder ${row.name}, in ${row.location}`}
        className="open"
        // Dragged to move it, and dropped on to move something into it (`useSidebarDrag`).
        data-drag="folder"
        data-drop={row.path}
        data-path={row.path}
        disabled={busy}
        onClick={() => {
          onFolder(row.path);
        }}
        type="button"
      >
        <KindIcon kind="folder" />
        <span className="row-title">{row.name}</span>
        {row.location !== "" && <span className="row-where">{row.location}</span>}
        <span aria-hidden="true" className="row-count">
          {row.count === 0 ? "" : String(row.count)}
        </span>
        <span aria-hidden="true" className="row-step">
          ›
        </span>
      </button>
    </div>
  );
}

export function Lecture({
  row,
  open,
  busy,
  onOpen,
  onEdit,
}: {
  readonly row: Extract<SidebarRow, { kind: "lecture" }>;
  readonly open: boolean;
  readonly busy: boolean;
  readonly onOpen: (lecture: LectureRow) => void;
  readonly onEdit: (lecture: LectureRow) => void;
}) {
  const waiting = row.meta !== "";
  // A note has no document to wait for; it opens whenever it is there.
  const openable = row.lecture.kind === "note" || row.lecture.documentReady;

  return (
    <div className="lecture-row" data-open={open}>
      <button
        // Named explicitly, because the name the browser computes from the content runs the
        // spans together: they are separated by a CSS `gap`, which is not text. The number
        // is left out -- the rows are already in that order -- and the conversion state is
        // folded in, so an item that cannot be opened says why rather than being silently
        // disabled.
        aria-label={[row.lecture.title, row.meta, row.location === "" ? "" : `in ${row.location}`]
          .filter((part) => part !== "")
          .join(", ")}
        className="open"
        data-drag="item"
        data-path={row.lecture.directory}
        disabled={busy || !openable}
        onClick={() => {
          onOpen(row.lecture);
        }}
        title={openable ? row.lecture.title : "This document has no PDF yet, so it cannot be opened."}
        type="button"
      >
        <KindIcon kind={row.lecture.kind} />
        {row.num !== "" && (
          <span aria-hidden="true" className="row-num">
            {row.num}
          </span>
        )}
        <span className="row-title">{row.lecture.title}</span>
        {row.location !== "" && <span className="row-where">{row.location}</span>}
        {waiting && (
          <span className="row-meta" data-state={row.lecture.conversion}>
            {row.meta}
          </span>
        )}
      </button>

      {/* Not on the canvas. Renaming, numbering and moving an item has to stay reachable,
          and its row is the only place it belongs. */}
      <button
        aria-label={`Edit ${row.lecture.title}`}
        className="row-edit"
        disabled={busy}
        onClick={() => {
          onEdit(row.lecture);
        }}
        title="Rename, number, tag or move"
        type="button"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

/**
 * The name for a new note or folder, typed where it will appear.
 *
 * Enter makes it, Escape or leaving the field with nothing typed forgets it. A blank name
 * makes nothing rather than an "Untitled": an item is found again by its name.
 */
export function NameField({
  making,
  onDone,
  onCancel,
}: {
  readonly making: Making;
  readonly onDone: (name: string) => void;
  readonly onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const label = making === "note" ? "Name of the new note" : "Name of the new folder";

  return (
    <form
      className="sidebar-name"
      onSubmit={(event) => {
        event.preventDefault();

        if (name.trim() === "") {
          onCancel();
        } else {
          onDone(name.trim());
        }
      }}
    >
      <KindIcon kind={making === "note" ? "note" : "folder"} />
      <input
        aria-label={label}
        // The field exists because someone just asked to name something.
        autoFocus
        onBlur={() => {
          if (name.trim() === "") {
            onCancel();
          }
        }}
        onChange={(event) => {
          setName(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
        placeholder={making === "note" ? "Note name" : "Folder name"}
        type="text"
        value={name}
      />
    </form>
  );
}

/** Not on the canvas: folders the walk could not use. Kept visible, per §1.1. */
export function Problems({
  title,
  problems,
}: {
  readonly title: string;
  readonly problems: readonly ProblemRow[];
}) {
  if (problems.length === 0) {
    return null;
  }

  return (
    <>
      <p className="overline">{`${title} · ${String(problems.length)}`}</p>
      {problems.map((problem) => (
        <p className="sidebar-empty" key={problem.directory}>
          {problem.remediation}
        </p>
      ))}
    </>
  );
}
