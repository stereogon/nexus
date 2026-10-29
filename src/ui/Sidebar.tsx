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
import type { LectureRow, ProblemRow } from "../ipc/vault";
import { shortPath } from "./path";
import {
  GROUPINGS,
  secondaryFacets,
  type GroupBy,
  type SidebarRow,
  type ThenBy,
} from "./sidebarRows";

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

/** Not on the canvas: see this module's note. */
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

function Lecture({
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

  return (
    <div className="lecture-row" data-open={open}>
      <button
        // Named explicitly, because the name the browser computes from the content is
        // wrong: the spans are separated by a CSS `gap`, which is not text, so `01` and
        // `Raft` run together as "01Raft". The number is left out of the name entirely —
        // it is the folder's prefix, the rows are already in that order, and reading it
        // aloud on every row is noise. The conversion state is folded in instead, so a
        // lecture that cannot be opened says why rather than being silently disabled.
        aria-label={waiting ? `${row.lecture.title}, ${row.meta}` : row.lecture.title}
        className="open"
        disabled={busy || !row.lecture.documentReady}
        onClick={() => {
          onOpen(row.lecture);
        }}
        // The indent the canvas specifies: 13px per level, on top of the row's own padding.
        style={{ paddingLeft: `${String(8 + row.depth * 13)}px` }}
        title={
          row.lecture.documentReady
            ? row.lecture.title
            : "This lecture has no PDF yet, so it cannot be opened."
        }
        type="button"
      >
        <span aria-hidden="true" className="row-num">
          {row.num}
        </span>
        <span className="row-title">{row.lecture.title}</span>
        {waiting && (
          <span className="row-meta" data-state={row.lecture.conversion}>
            {row.meta}
          </span>
        )}
      </button>

      {/* Not on the canvas. Editing a title and its facets has to stay reachable, and the
          row is the only place it belongs; the canvas has no affordance for it at all. */}
      <button
        aria-label={`Edit ${row.lecture.title}`}
        className="row-edit"
        disabled={busy}
        onClick={() => {
          onEdit(row.lecture);
        }}
        title="Edit course, week and tags"
        type="button"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

/** Not on the canvas: folders the walk could not use. Kept visible, per §1.1. */
function Problems({
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
}) {
  const secondary = secondaryFacets(groupBy);

  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <label className="vh" htmlFor="vault-search">
          Search vault
        </label>
        <SearchIcon />
        <input
          id="vault-search"
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
        {rows.length === 0 && (
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
