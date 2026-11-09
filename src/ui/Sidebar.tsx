/**
 * The vault, one folder at a time.
 *
 * The vault switcher and the "+" (`SidebarHead`), the control that opens ⌘P search, a
 * breadcrumb saying which folder is showing, its folders and items, and the library, errors
 * and theme controls at the foot (`SidebarFoot`). Whatever is added goes into the folder on
 * screen, so nothing has to be filed afterwards.
 * What goes in the list is decided in `sidebarRows.ts`, tested on its own; this file draws
 * the result.
 *
 * Laid out from the redesign canvas (2026-11-07), which drew the folder sidebar chosen with
 * the user on 2026-11-06 (`sidebarRows.ts` says why).
 */
import { useState } from "react";

import type { LectureRow, ProblemRow } from "../ipc/vault";
import { nameOf, trail, vaultNameOf } from "./folders";
import { SidebarFoot } from "./SidebarFoot";
import { SidebarHead } from "./SidebarHead";
import { useMetaShortcut } from "./useMetaShortcut";
import { Folder, Lecture, NameField, Problems } from "./SidebarLecture";
import type { Making, SidebarRow } from "./sidebarRows";

function SearchIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
      <circle cx="6" cy="6" fill="none" r="4.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.3 9.3 L12.5 12.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
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
  busy,
  openDirectory,
  skipped,
  unloadable,
  onFolder,
  onOpen,
  onEdit,
  onMake,
  onImport,
  onHide,
  onChooseVault,
  foot,
  onSearch,
  width,
}: {
  readonly rows: readonly SidebarRow[];
  readonly root: string;
  /** The folder showing; `""` is the top of the vault. */
  readonly folder: string;
  readonly busy: boolean;
  readonly openDirectory: string | null;
  readonly skipped: readonly ProblemRow[];
  readonly unloadable: readonly ProblemRow[];
  readonly onFolder: (path: string) => void;
  readonly onOpen: (lecture: LectureRow) => void;
  readonly onEdit: (lecture: LectureRow) => void;
  /** Makes a note or folder of that name in the folder showing. */
  readonly onMake: (making: Making, name: string) => void;
  /** Picks documents to import into the folder showing. */
  readonly onImport: () => void;
  readonly onHide: () => void;
  readonly onChooseVault: () => void;
  /** The library, error panel and theme controls at the foot. */
  readonly foot: Omit<Parameters<typeof SidebarFoot>[0], "root">;
  /** Opens the ⌘P search window. */
  readonly onSearch: () => void;
  /** A dragged width, or `null` for the stylesheet's. */
  readonly width: number | null;
}) {
  const [making, setMaking] = useState<Making | null>(null);

  // The + menu's Note and Folder from the keyboard, as it shows them (canvas, 2026-11-09).
  useMetaShortcut("n", !busy, () => {
    setMaking("note");
  });
  useMetaShortcut("n", !busy, () => {
    setMaking("folder");
  }, true);

  return (
    // A dragged width replaces the stylesheet's; `useSidebarWidth` has held it to the window.
    <aside className="sidebar" style={width === null ? undefined : { flexBasis: width }}>
      <SidebarHead
        busy={busy}
        onChooseVault={onChooseVault}
        onHide={onHide}
        onImport={onImport}
        onMake={setMaking}
        place={folder === "" ? vaultNameOf(root) : nameOf(folder)}
        root={root}
      />

      <div className="sidebar-search">
        <button className="search-open" onClick={onSearch} type="button">
          <SearchIcon />
          <span>Search everything</span>
          <span className="kbd">⌘P</span>
        </button>
      </div>

      <Crumbs folder={folder} onFolder={onFolder} root={root} />

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

        {rows.length === 0 && making === null && (
          // As the canvas has it: the folder named, and the first thing to do offered.
          <div className="sidebar-empty">
            <p>Nothing in {folder === "" ? vaultNameOf(root) : nameOf(folder)} yet.</p>
            <button
              disabled={busy}
              onClick={() => {
                setMaking("note");
              }}
              type="button"
            >
              New note
            </button>
            <p className="sidebar-empty-hint">Or drop a PDF, PowerPoint or Word file on the window.</p>
          </div>
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


        <Problems problems={skipped} title="Folders skipped" />
        <Problems problems={unloadable} title="Could not be read" />
      </div>

      <SidebarFoot root={root} {...foot} />
    </aside>
  );
}
