/**
 * What a sidebar search found inside lectures: lines of notes and highlighted text.
 *
 * Below the lectures whose titles match, so a search reads top to bottom from "this
 * lecture" to "this lecture mentions it". Each result opens its lecture at the place: a
 * line of notes is scrolled to and flashed, a highlight is jumped to and pulsed.
 */
import type { Snippet, VaultSearch } from "../ipc/search";
import type { LectureRow } from "../ipc/vault";
import { SEMANTIC_GLYPH, SEMANTIC_LABEL } from "./semantics";
import type { ArrivalTarget } from "./useArrival";

/** A match in context, with the matched words marked. */
export function SnippetText({ snippet }: { readonly snippet: Snippet }) {
  return (
    <span className="search-snippet">
      {snippet.before}
      <mark>{snippet.matched}</mark>
      {snippet.after}
    </span>
  );
}

export function SearchHits({
  found,
  lectures,
  onOpenAt,
}: {
  readonly found: VaultSearch;
  readonly lectures: readonly LectureRow[];
  readonly onOpenAt: (lecture: LectureRow, target: ArrivalTarget) => void;
}) {
  const byDirectory = new Map(lectures.map((lecture) => [lecture.directory, lecture]));

  return (
    <section aria-label="Found in notes and highlights" className="search-hits">
      <p className="overline">In notes and highlights</p>

      {found.lectures.length === 0 && <p className="sidebar-empty">No notes or highlights mention it.</p>}

      {found.lectures.map((hits) => {
        const lecture = byDirectory.get(hits.directory);

        // A lecture removed since the search was asked; its results lead nowhere.
        if (lecture === undefined) {
          return null;
        }

        return (
          <div className="search-hit-lecture" key={hits.directory}>
            <p className="search-hit-title">{lecture.title}</p>

            {hits.notes.map((hit) => (
              <button
                className="search-hit"
                key={`line:${String(hit.line)}`}
                onClick={() => {
                  onOpenAt(lecture, { kind: "line", line: hit.line });
                }}
                type="button"
              >
                <span className="search-hit-where">Notes, line {hit.line}</span>
                <SnippetText snippet={hit.snippet} />
              </button>
            ))}

            {hits.noteLines > hits.notes.length && (
              <p className="search-hit-more">and {hits.noteLines - hits.notes.length} more lines in the notes</p>
            )}

            {hits.marks.map((hit) => (
              <button
                className="search-hit"
                key={`mark:${hit.id}`}
                onClick={() => {
                  onOpenAt(lecture, { kind: "highlight", id: hit.id });
                }}
                type="button"
              >
                <span className="search-hit-where">
                  {hit.semantic === null ? (
                    "Sticky note"
                  ) : (
                    <>
                      <span className="search-hit-badge" data-semantic={hit.semantic} title={SEMANTIC_LABEL[hit.semantic]}>
                        {SEMANTIC_GLYPH[hit.semantic]}
                      </span>{" "}
                      {SEMANTIC_LABEL[hit.semantic]}
                    </>
                  )}
                  , page {hit.page}
                </span>
                <SnippetText snippet={hit.snippet} />
              </button>
            ))}
          </div>
        );
      })}

      {found.unreadable > 0 && (
        <p className="note">
          {found.unreadable === 1 ? "One item" : `${String(found.unreadable)} items`} could not be searched, because
          its notes or highlights could not be read. Opening it shows why.
        </p>
      )}
      {found.truncated && <p className="note">Showing the first results only. Type more to narrow the search.</p>}
    </section>
  );
}
