/**
 * Every highlight in the vault, filterable — for revision: "every exam point in week 3".
 *
 * Takes the document pane's place while open; choosing a highlight opens its lecture at it
 * and closes the library. Read fresh each time it opens, from the lectures' own files, so
 * it can never disagree with what the lectures show.
 */
import { useEffect, useState } from "react";

import { vaultHighlights, type VaultMarks } from "../ipc/search";
import { asCommandError, type CommandError, type LectureRow } from "../ipc/vault";
import { Failure } from "./Failure";
import {
  facetChoices,
  kindOf,
  libraryGroups,
  MARK_KINDS,
  NO_FILTER,
  wordsOf,
  type LibraryFilter,
  type MarkKind,
} from "./highlightLibrary";
import { SEMANTIC_GLYPH, SEMANTIC_LABEL } from "./semantics";
import type { ArrivalTarget } from "./useArrival";

const KIND_LABEL: Record<MarkKind, string> = { ...SEMANTIC_LABEL, sticky: "Sticky notes" };
const KIND_GLYPH: Record<MarkKind, string> = { ...SEMANTIC_GLYPH, sticky: "✎" };

/** One facet's menu: every value, or one. */
function FacetMenu({
  label,
  every,
  values,
  value,
  onChange,
}: {
  readonly label: string;
  readonly every: string;
  readonly values: readonly string[];
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
}) {
  return (
    <label className="library-facet">
      <span className="vh">{label}</span>
      <select
        onChange={(event) => {
          onChange(event.target.value === "" ? null : event.target.value);
        }}
        value={value ?? ""}
      >
        <option value="">{every}</option>
        {values.map((each) => (
          <option key={each} value={each}>
            {each}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HighlightsLibrary({
  vault,
  lectures,
  onOpenAt,
  onClose,
}: {
  readonly vault: string;
  readonly lectures: readonly LectureRow[];
  readonly onOpenAt: (lecture: LectureRow, target: ArrivalTarget) => void;
  readonly onClose: () => void;
}) {
  const [marks, setMarks] = useState<VaultMarks | null>(null);
  const [failure, setFailure] = useState<CommandError | null>(null);
  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);

  useEffect(() => {
    const session = { current: true };
    const live = () => session.current;

    void (async () => {
      try {
        const read = await vaultHighlights(vault, lectures.map((lecture) => lecture.directory));

        if (live()) {
          setMarks(read);
        }
      } catch (thrown: unknown) {
        if (live()) {
          setFailure(asCommandError(thrown));
        }
      }
    })();

    return () => {
      session.current = false;
    };
  }, [vault, lectures]);

  const groups = marks === null ? [] : libraryGroups(marks, lectures, filter);
  const shown = groups.reduce((count, group) => count + group.marks.length, 0);
  const choices = marks === null ? null : facetChoices(marks, lectures);

  const toggle = (kind: MarkKind) => {
    setFilter((current) => {
      const kinds = new Set(current.kinds);

      if (!kinds.delete(kind)) {
        kinds.add(kind);
      }

      return { ...current, kinds };
    });
  };

  return (
    <main aria-labelledby="library-heading" className="pane library">
      <header className="library-head">
        <h2 id="library-heading">Highlights</h2>
        {marks !== null && <span className="library-count">{shown === 1 ? "1 highlight" : `${String(shown)} highlights`}</span>}
        <button className="secondary" onClick={onClose} type="button">
          Close
        </button>
      </header>

      <div aria-label="Filter highlights" className="library-filters" role="group">
        <div aria-label="Show only" className="library-kinds" role="group">
          {MARK_KINDS.map((kind) => (
            <button
              aria-pressed={filter.kinds.has(kind)}
              className="library-kind"
              data-kind={kind}
              key={kind}
              onClick={() => {
                toggle(kind);
              }}
              type="button"
            >
              <span aria-hidden="true" className="library-glyph" data-kind={kind}>
                {KIND_GLYPH[kind]}
              </span>
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>

        {choices !== null && (
          <>
            <FacetMenu
              every="All courses"
              label="Course"
              onChange={(course) => {
                setFilter((current) => ({ ...current, course }));
              }}
              value={filter.course}
              values={choices.courses}
            />
            <FacetMenu
              every="All modules"
              label="Module"
              onChange={(module) => {
                setFilter((current) => ({ ...current, module }));
              }}
              value={filter.module}
              values={choices.modules}
            />
            <FacetMenu
              every="All weeks"
              label="Week"
              onChange={(week) => {
                setFilter((current) => ({ ...current, week }));
              }}
              value={filter.week}
              values={choices.weeks}
            />
          </>
        )}

        <label className="library-search">
          <span className="vh">Highlighted words</span>
          <input
            onChange={(event) => {
              setFilter((current) => ({ ...current, text: event.target.value }));
            }}
            placeholder="Filter by words"
            type="search"
            value={filter.text}
          />
        </label>
      </div>

      {failure !== null && <Failure error={failure} />}
      {marks === null && failure === null && <p className="empty">Reading the vault's highlights…</p>}
      {marks !== null && marks.lectures.length === 0 && (
        <p className="empty">No highlights yet. Select text on a page and choose a meaning to make one.</p>
      )}
      {marks !== null && marks.lectures.length > 0 && groups.length === 0 && <p className="empty">No highlights match these filters.</p>}
      {marks !== null && marks.unreadable > 0 && (
        <p className="note">
          {marks.unreadable === 1 ? "One lecture's" : `${String(marks.unreadable)} lectures'`} highlights could not be read
          and are not shown. Opening the lecture shows why.
        </p>
      )}

      {groups.map((group) => (
        <section aria-label={group.lecture.title} className="library-lecture" key={group.lecture.directory}>
          <h3>{group.lecture.title}</h3>
          <p className="library-facets">
            {[group.lecture.course, group.lecture.module, group.lecture.week].filter((facet) => facet !== null).join(" · ")}
          </p>
          <ul>
            {group.marks.map((mark) => (
              <li key={mark.id}>
                <button
                  className="library-mark"
                  onClick={() => {
                    onOpenAt(group.lecture, { kind: "highlight", id: mark.id });
                  }}
                  type="button"
                >
                  <span className="library-glyph" data-kind={kindOf(mark)} title={KIND_LABEL[kindOf(mark)]}>
                    {KIND_GLYPH[kindOf(mark)]}
                  </span>
                  <span className="library-words">{wordsOf(mark) === "" ? "An area of the page" : wordsOf(mark)}</span>
                  <span className="library-page">p. {mark.page}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
