/**
 * The lecture rows, and the two problem lists beside them.
 *
 * Presentational only: it is handed a validated `VaultSummary` and draws it. Every
 * decision it might be tempted to make — whether a document can be opened, what a skip
 * means — has already been made in Rust and arrives as a field.
 */
import type { ConversionState, LectureRow, ProblemRow, VaultSummary } from "../ipc/vault";

/**
 * What each conversion state is called in the interface.
 *
 * Spelled out rather than prettified from the wire name, so the words a person reads are
 * chosen rather than derived. `notRequired` is shown as "PDF" because that is what it
 * means to them: the file was already the canonical format and nothing had to happen.
 */
const CONVERSION_LABEL: Readonly<Record<ConversionState, string>> = {
  notRequired: "PDF",
  queued: "Waiting to convert",
  converting: "Converting",
  ready: "Converted",
  failed: "Conversion failed",
};

function Facet({ value }: { readonly value: string }) {
  return <span className="facet">{value}</span>;
}

function Lecture({ lecture }: { readonly lecture: LectureRow }) {
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
      </div>
      <div className="path">{lecture.directory}</div>
      {(facets.length > 0 || lecture.tags.length > 0) && (
        <div className="facets">
          {facets.map((facet) => (
            <Facet key={facet} value={facet} />
          ))}
          {lecture.tags.map((tag) => (
            <Facet key={`tag:${tag}`} value={`#${tag}`} />
          ))}
        </div>
      )}
    </li>
  );
}

function Problems({ title, problems }: { readonly title: string; readonly problems: readonly ProblemRow[] }) {
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
export function LectureList({ summary }: { readonly summary: VaultSummary }) {
  return (
    <>
      <p className="path">{summary.root}</p>

      {summary.lectures.length === 0 ? (
        <p className="empty">
          No lectures here yet. A lecture is any folder holding a <code>manifest.json</code>.
        </p>
      ) : (
        <>
          <h2>
            {summary.lectures.length} {summary.lectures.length === 1 ? "lecture" : "lectures"}
          </h2>
          <ul className="reset">
            {summary.lectures.map((lecture) => (
              <Lecture key={lecture.directory} lecture={lecture} />
            ))}
          </ul>
        </>
      )}

      <Problems title="Folders skipped" problems={summary.skipped} />
      <Problems title="Lectures that could not be read" problems={summary.unloadable} />
    </>
  );
}
