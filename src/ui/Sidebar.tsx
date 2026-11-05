/**
 * The vault, as the canvas's Workspace artboards draw it.
 *
 * Search, the Folder/Week/Module/Tag segmented control, one flat scroller of indented
 * rows, and the vault path along the bottom. What goes in the scroller is decided in
 * `sidebarRows.ts`, which is tested on its own; this file draws the result.
 *
 * Two things here are **not** on the canvas, and are marked where they appear: the per-row
 * edit control, and the two problem lists. Both are recorded in `PROGRESS.md` as states
 * the canvas should gain, rather than left as quiet differences.
 */
import type { ReactNode } from "react";

import type { LectureRow, ProblemRow } from "../ipc/vault";
import { shortPath } from "./path";
import { Lecture, Problems } from "./SidebarLecture";
import { GROUPINGS, secondaryFacets, type GroupBy, type SidebarRow, type ThenBy } from "./sidebarRows";
import { SEARCH_ID } from "./useSidebar";

/** What each facet is called in the second row of controls. */
const FACET_LABEL = { week: "Week", module: "Module", tag: "Tag" } as const;

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

export function Sidebar({
  rows,
  root,
  groupBy,
  thenBy,
  query,
  busy,
  openDirectory,
  skipped,
  unloadable,
  onGroupBy,
  onThenBy,
  onQuery,
  onOpen,
  onEdit,
  hits,
}: {
  readonly rows: readonly SidebarRow[];
  readonly root: string;
  readonly groupBy: GroupBy;
  readonly thenBy: ThenBy;
  readonly query: string;
  readonly busy: boolean;
  readonly openDirectory: string | null;
  readonly skipped: readonly ProblemRow[];
  readonly unloadable: readonly ProblemRow[];
  readonly onGroupBy: (grouping: GroupBy) => void;
  readonly onThenBy: (grouping: ThenBy) => void;
  readonly onQuery: (text: string) => void;
  readonly onOpen: (lecture: LectureRow) => void;
  readonly onEdit: (lecture: LectureRow) => void;
  /** What the search found inside lectures, below the matching titles; `null` when not searching. */
  readonly hits: ReactNode;
}) {
  const secondary = secondaryFacets(groupBy);

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
          placeholder="Search lectures"
          type="search"
          value={query}
        />
        <span className="kbd">⌘P</span>
      </div>

      <div className="sidebar-group-by">
        <p className="overline">Group by</p>
        <div aria-label="Group lectures by" className="segmented" role="group">
          {GROUPINGS.map(([name, label]) => (
            <button
              aria-pressed={groupBy === name}
              key={name}
              onClick={() => {
                onGroupBy(name);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Not on the canvas, whose control picks exactly one grouping. Asking for
            lectures by module then gets every lecture of that module in one flat pile,
            which on a real course is thirty rows with no structure. Teaching material is
            organised on two axes at once. Hidden for Folder, which already nests as
            deeply as the directories do. */}
        {secondary.length > 0 && (
          <div className="then-by">
            <span className="overline">Then by</span>
            <div aria-label="Then group by" className="segmented" role="group">
              <button
                aria-pressed={thenBy === "none"}
                onClick={() => {
                  onThenBy("none");
                }}
                type="button"
              >
                None
              </button>
              {secondary.map((facet) => (
                <button
                  aria-pressed={thenBy === facet}
                  key={facet}
                  onClick={() => {
                    onThenBy(facet);
                  }}
                  type="button"
                >
                  {FACET_LABEL[facet]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-list">
        {rows.length === 0 && hits === null && (
          <p className="sidebar-empty">
            {query.trim() === ""
              ? "No lectures yet. Drop a PDF, PowerPoint or Word file on the window."
              : `Nothing matches “${query.trim()}”.`}
          </p>
        )}

        {rows.map((row) =>
          row.kind === "group" ? (
            <p
              className="overline"
              key={row.key}
              style={{ paddingLeft: `${String(8 + row.depth * 13)}px` }}
            >
              {row.label}
            </p>
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

      <div className="sidebar-foot">
        <FolderIcon />
        <span title={root}>{shortPath(root)}</span>
      </div>
    </aside>
  );
}
