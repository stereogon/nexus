/**
 * The lecture rows, grouped on a facet, and the two problem lists beside them.
 *
 * # Grouping happens here, not in Rust
 *
 * §3: "The sidebar groups on facets at runtime, so one physical layout serves many logical
 * views." Runtime means *this* layer: the rows already carry their facets, grouping them is
 * presentation rather than domain, and doing it in Rust would put an IPC round trip behind
 * changing a dropdown.
 *
 * Everything else here is presentational too. Whether a document can be opened, what a skip
 * means — those decisions are already made in Rust and arrive as fields.
 */
import type {
  ConversionState,
  LectureRow,
  ProblemRow,
  VaultSummary,
} from "../ipc/vault";

/** Which facet the list is grouped on. */
export type GroupBy = "none" | "course" | "module" | "week";

/** Shown for lectures that have no value for the facet being grouped on. */
const UNFILED = "Unfiled";

/**
 * What each conversion state is called in the interface.
 *
 * Spelled out rather than prettified from the wire name, so the words a person reads are
 * chosen. `notRequired` is shown as "PDF" because that is what it means to them: the file
 * was already the canonical format and nothing had to happen.
 */
const CONVERSION_LABEL: Readonly<Record<ConversionState, string>> = {
  notRequired: "PDF",
  queued: "Waiting to convert",
  converting: "Converting",
  ready: "Converted",
  failed: "Conversion failed",
};

/**
 * The lectures, in groups.
 *
 * `Unfiled` always sorts last however the groups are named: it is the pile to work
 * through, and burying it among the real groups would hide the work.
 */
export function grouped(
  lectures: readonly LectureRow[],
  by: GroupBy,
): readonly (readonly [string, readonly LectureRow[]])[] {
  if (by === "none") {
    return [["", lectures]];
  }

  const groups = new Map<string, LectureRow[]>();

  for (const lecture of lectures) {
    const key = lecture[by] ?? UNFILED;
    const held = groups.get(key);

    if (held === undefined) {
      groups.set(key, [lecture]);
    } else {
      held.push(lecture);
    }
  }

  return [...groups].sort(([left], [right]) => {
    if (left === UNFILED) {
      return 1;
    }

    if (right === UNFILED) {
      return -1;
    }

    return left.localeCompare(right);
  });
}

/** "1 lecture" or "7 lectures", because a heading reading "1 lectures" is sloppy. */
function counted(total: number): string {
  return `${String(total)} ${total === 1 ? "lecture" : "lectures"}`;
}

function Facet({ value }: { readonly value: string }) {
  return <span className="facet">{value}</span>;
}

function Lecture({
  lecture,
  busy,
  onEdit,
  onOpen,
}: {
  readonly lecture: LectureRow;
  readonly busy: boolean;
  readonly onEdit: (lecture: LectureRow) => void;
  readonly onOpen: (lecture: LectureRow) => void;
}) {
  const facets = [lecture.course, lecture.module, lecture.week].filter(
    (facet): facet is string => facet !== null,
  );

  return (
    <li className="card">
      <div className="lecture">
        <span className="lecture-title">{lecture.title}</span>
        <span className="code">{lecture.sequence}</span>
        <span className="badge" data-state={lecture.conversion}>
          {CONVERSION_LABEL[lecture.conversion]}
        </span>
        <button
          className="secondary"
          // Disabled on the state the domain decides, not on a conversion name read here:
          // `documentReady` is sent precisely so this rule lives in one place.
          disabled={busy || !lecture.documentReady}
          onClick={() => {
            onOpen(lecture);
          }}
          type="button"
        >
          Open
        </button>
      </div>
      <div className="path">{lecture.directory}</div>
      <div className="facets">
        {facets.map((facet) => (
          <Facet key={facet} value={facet} />
        ))}
        {lecture.tags.map((tag) => (
          <Facet key={`tag:${tag}`} value={`#${tag}`} />
        ))}
        <button
          className="link"
          disabled={busy}
          onClick={() => {
            onEdit(lecture);
          }}
          type="button"
        >
          {facets.length === 0 && lecture.tags.length === 0
            ? "Add a course or week"
            : "Edit"}
        </button>
      </div>
    </li>
  );
}

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
      <h2>{title}</h2>
      <ul className="reset">
        {problems.map((problem) => (
          <li className="card problem" key={problem.directory}>
            <div className="path">{problem.directory}</div>
            <div>{problem.remediation}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Draws a loaded vault.
 *
 * The problem lists are shown *below* the lectures rather than instead of them, which is
 * the whole reason `LoadedVault` has three lists: a vault of three hundred lectures with
 * one corrupt manifest must still open.
 */
export function LectureList({
  summary,
  groupBy,
  busy,
  onEdit,
  onOpen,
}: {
  readonly summary: VaultSummary;
  readonly groupBy: GroupBy;
  readonly busy: boolean;
  readonly onEdit: (lecture: LectureRow) => void;
  readonly onOpen: (lecture: LectureRow) => void;
}) {
  return (
    <>
      <p className="path">{summary.root}</p>

      {summary.lectures.length === 0 ? (
        <p className="empty">
          No lectures here yet. Add one, and it becomes a folder holding its
          document, your notes and a <code>manifest.json</code>.
        </p>
      ) : (
        grouped(summary.lectures, groupBy).map(([name, lectures]) => (
          <section key={name === "" ? "all" : name}>
            <h2>
              {name === ""
                ? counted(summary.lectures.length)
                : `${name} · ${String(lectures.length)}`}
            </h2>
            <ul className="reset">
              {lectures.map((lecture) => (
                <Lecture
                  busy={busy}
                  key={lecture.directory}
                  lecture={lecture}
                  onEdit={onEdit}
                  onOpen={onOpen}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <Problems title="Folders skipped" problems={summary.skipped} />
      <Problems
        title="Lectures that could not be read"
        problems={summary.unloadable}
      />
    </>
  );
}
