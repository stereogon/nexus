/**
 * One row of the sidebar: a lecture, with its edit control — and the lists of folders the
 * vault walk could not use. Moved out of `Sidebar.tsx` on 2026-11-05, when search results
 * took that file to the line limit; these draw single rows and need nothing of the
 * sidebar's own state.
 *
 * The edit control and the problem lists are not on the canvas; see `Sidebar.tsx`.
 */
import type { LectureRow, ProblemRow } from "../ipc/vault";
import type { SidebarRow } from "./sidebarRows";

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
