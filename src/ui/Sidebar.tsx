/**
 * The vault, one folder at a time.
 *
 * The vault switcher and the "+" (`SidebarHead`), a
 * breadcrumb saying which folder is showing, its folders and items, and the library, errors
 * and theme controls at the foot (`SidebarFoot`). Whatever is added goes into the folder on
 * screen, so nothing has to be filed afterwards.
 * What goes in the list is decided in `sidebarRows.ts`, tested on its own; this file draws
 * the result.
 *
 * Laid out from the redesign canvas (2026-11-07), which drew the folder sidebar chosen with
 * the user on 2026-11-06 (`sidebarRows.ts` says why). The control that opens ⌘P search and
 * the one that hides the sidebar are in the window bar (`WindowBar`, 2026-11-14).
 */
import { useRef, useState } from "react";

import type { LectureRow, ProblemRow } from "../ipc/vault";
import { nameOf, trail, vaultNameOf } from "./folders";
import { SidebarFoot } from "./SidebarFoot";
import { SidebarHead } from "./SidebarHead";
import { useMetaShortcut } from "./useMetaShortcut";
import { useSidebarDrag, type Dragged } from "./useSidebarDrag";
import { Folder, Lecture, NameField, Problems } from "./SidebarLecture";
import type { Making, SidebarRow } from "./sidebarRows";

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
            // Up the path, somewhere to drop what is dragged (`useSidebarDrag`).
            data-drop=""
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
              data-drop={path}
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
  onChooseVault,
  foot,
  width,
  onMove,
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
  readonly onChooseVault: () => void;
  /** The library, error panel and theme controls at the foot. */
  readonly foot: Omit<Parameters<typeof SidebarFoot>[0], "root">;
  /** A dragged width, or `null` for the stylesheet's. */
  readonly width: number | null;
  /** An item or folder dragged onto a folder, to move it there (`useSidebarDrag`). */
  readonly onMove: (dragged: Dragged, into: string) => void;
}) {
  const [making, setMaking] = useState<Making | null>(null);
  const box = useRef<HTMLElement | null>(null);
  const ghost = useSidebarDrag(box, onMove);

  // The + menu's Note and Folder from the keyboard, as it shows them (canvas, 2026-11-09).
  useMetaShortcut("n", !busy, () => {
    setMaking("note");
  });
  useMetaShortcut("n", !busy, () => {
    setMaking("folder");
  }, true);

  return (
    // A dragged width replaces the stylesheet's; `useSidebarWidth` has held it to the window.
    <aside className="sidebar" ref={box} style={width === null ? undefined : { flexBasis: width }}>
      {ghost !== null && (
        <div aria-hidden="true" className="sidebar-ghost" style={{ left: ghost.x + 12, top: ghost.y + 8 }}>
          {ghost.label}
        </div>
      )}
      <SidebarHead
        busy={busy}
        onChooseVault={onChooseVault}
        onImport={onImport}
        onMake={setMaking}
        place={folder === "" ? vaultNameOf(root) : nameOf(folder)}
        root={root}
      />

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
