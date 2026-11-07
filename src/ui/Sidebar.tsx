/**
 * The vault, one folder at a time.
 *
 * Search across the whole vault, a breadcrumb saying which folder is showing, its folders
 * and items, and the three ways to add something here: a note, a folder, or a document.
 * Whatever is added goes into the folder on screen, so nothing has to be filed afterwards.
 * What goes in the list is decided in `sidebarRows.ts`, tested on its own; this file draws
 * the result.
 *
 * The canvas's sidebar groups by Folder/Week/Module/Tag instead. Stepping into folders was
 * chosen with the user on 2026-11-06 (`sidebarRows.ts` says why), so this is designed here
 * to sit with the rest of the window and is recorded in `PROGRESS.md` as owing an artboard.
 */
import { useState, type ReactNode } from "react";

import type { LectureRow, ProblemRow } from "../ipc/vault";
import { nameOf, trail, vaultNameOf } from "./folders";
import { shortPath } from "./path";
import { Folder, Lecture, NameField, Problems } from "./SidebarLecture";
import type { Making, SidebarRow } from "./sidebarRows";
import { SEARCH_ID } from "./useSidebar";

function SearchIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
      <circle cx="6" cy="6" fill="none" r="4.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.3 9.3 L12.5 12.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" height="13" viewBox="0 0 13 13" width="13">
      <path
        d="M1.2 3.4 A1.2 1.2 0 0 1 2.4 2.2 L5.2 2.2 L6.4 3.8 L10.6 3.8 A1.2 1.2 0 0 1 11.8 5 L11.8 9.6 A1.2 1.2 0 0 1 10.6 10.8 L2.4 10.8 A1.2 1.2 0 0 1 1.2 9.6 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/** Where the list is: the vault, then each folder down to the one showing. */
function Crumbs({
  root,
  folder,
  onFolder,
}: {
  readonly root: string;
  readonly folder: string;
  readonly onFolder: (path: string) => void;
}) {
  const steps = trail(folder);
  const up = steps.at(-2) ?? "";

  return (
    <nav aria-label="Folder" className="sidebar-crumbs">
      <button
        aria-label="Back to the folder above"
        className="crumb-back"
        disabled={folder === ""}
        onClick={() => {
          onFolder(up);
        }}
        title="Back"
        type="button"
      >
        ‹
      </button>
      <ol>
        <li>
          <button
            aria-current={folder === "" ? "location" : undefined}
            onClick={() => {
              onFolder("");
            }}
            type="button"
          >
            {vaultNameOf(root)}
          </button>
        </li>
        {steps.map((path) => (
          <li key={path}>
            <button
              aria-current={path === folder ? "location" : undefined}
              onClick={() => {
                onFolder(path);
              }}
              type="button"
            >
              {nameOf(path)}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Sidebar({
  rows,
  root,
  folder,
  query,
  busy,
  openDirectory,
  skipped,
  unloadable,
  onFolder,
  onQuery,
  onOpen,
  onEdit,
  onMake,
  onImport,
  hits,
}: {
  readonly rows: readonly SidebarRow[];
  readonly root: string;
  /** The folder showing; `""` is the top of the vault. */
  readonly folder: string;
  readonly query: string;
  readonly busy: boolean;
  readonly openDirectory: string | null;
  readonly skipped: readonly ProblemRow[];
  readonly unloadable: readonly ProblemRow[];
  readonly onFolder: (path: string) => void;
  readonly onQuery: (text: string) => void;
  readonly onOpen: (lecture: LectureRow) => void;
  readonly onEdit: (lecture: LectureRow) => void;
  /** Makes a note or folder of that name in the folder showing. */
  readonly onMake: (making: Making, name: string) => void;
  /** Picks documents to import into the folder showing. */
  readonly onImport: () => void;
  /** What the search found inside items, below the matching names; `null` when not searching. */
  readonly hits: ReactNode;
}) {
  const [making, setMaking] = useState<Making | null>(null);
  const searching = query.trim() !== "";

  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <label className="vh" htmlFor={SEARCH_ID}>
          Search vault
        </label>
        <SearchIcon />
        <input
          id={SEARCH_ID}
          onChange={(event) => {
            onQuery(event.target.value);
          }}
          placeholder="Search everything"
          type="search"
          value={query}
        />
        <span className="kbd">⌘P</span>
      </div>

      {!searching && <Crumbs folder={folder} onFolder={onFolder} root={root} />}

      <div className="sidebar-list">
        {making !== null && (
          <NameField
            making={making}
            onCancel={() => {
              setMaking(null);
            }}
            onDone={(name) => {
              setMaking(null);
              onMake(making, name);
            }}
          />
        )}

        {rows.length === 0 && hits === null && making === null && (
          <p className="sidebar-empty">
            {searching
              ? `Nothing matches “${query.trim()}”.`
              : "Nothing here yet. Make a note or a folder below, or drop a PDF, PowerPoint or Word file on the window."}
          </p>
        )}

        {rows.map((row) =>
          row.kind === "folder" ? (
            <Folder busy={busy} key={row.key} onFolder={onFolder} row={row} />
          ) : (
            <Lecture
              busy={busy}
              key={row.key}
              onEdit={onEdit}
              onOpen={onOpen}
              open={row.lecture.directory === openDirectory}
              row={row}
            />
          ),
        )}

        {hits}

        <Problems problems={skipped} title="Folders skipped" />
        <Problems problems={unloadable} title="Could not be read" />
      </div>

      <div aria-label="Add to this folder" className="sidebar-add" role="group">
        <button
          className="quiet"
          disabled={busy}
          onClick={() => {
            setMaking("note");
          }}
          type="button"
        >
          + Note
        </button>
        <button
          className="quiet"
          disabled={busy}
          onClick={() => {
            setMaking("folder");
          }}
          type="button"
        >
          + Folder
        </button>
        <button className="quiet" disabled={busy} onClick={onImport} title="Import a document (⌘O)" type="button">
          Import…
        </button>
      </div>

      <div className="sidebar-foot">
        <FolderIcon />
        <span title={root}>{shortPath(root)}</span>
      </div>
    </aside>
  );
}
