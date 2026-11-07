/**
 * Every highlight in the vault, filterable — for revision: "every exam point in Week 3",
 * where Week 3 is a folder.
 *
 * Takes the document pane's place while open; choosing a highlight opens its document at
 * it and closes the library. Read fresh each time it opens, from the documents' own files,
 * so it can never disagree with what they show.
 */
import { useEffect, useState } from "react";

import { vaultHighlights, type VaultMarks } from "../ipc/search";
import { asCommandError, type CommandError, type LectureRow } from "../ipc/vault";
import { Failure } from "./Failure";
import { parentOf, spoken } from "./folders";
import {
  folderChoices,
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
  const choices = marks === null ? null : folderChoices(marks, lectures);

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
      <header className="library-head pane-head lead" data-tauri-drag-region="">
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
          <label className="library-facet">
            <span className="vh">Folder</span>
            <select
              onChange={(event) => {
                const folder = event.target.value;

                setFilter((current) => ({ ...current, folder: folder === "" ? null : folder }));
              }}
              value={filter.folder ?? ""}
            >
              <option value="">Every folder</option>
              {choices.map((path) => (
                <option key={path} value={path}>
                  {spoken(path)}
                </option>
              ))}
            </select>
          </label>
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

      <div className="library-body">
        {failure !== null && <Failure error={failure} />}
        {marks === null && failure === null && <p className="empty">Reading the vault's highlights…</p>}
        {marks !== null && marks.lectures.length === 0 && (
          <p className="empty">No highlights yet. Select text on a page and choose a meaning to make one.</p>
        )}
        {marks !== null && marks.lectures.length > 0 && groups.length === 0 && <p className="empty">No highlights match these filters.</p>}
        {marks !== null && marks.unreadable > 0 && (
          <p className="note">
            {marks.unreadable === 1 ? "One document's" : `${String(marks.unreadable)} documents'`} highlights could not be read
            and are not shown. Opening the document shows why.
          </p>
        )}

        <div className="library-groups">
          {groups.map((group) => (
            <section aria-label={group.lecture.title} className="library-lecture" key={group.lecture.directory}>
              <h3>{group.lecture.title}</h3>
              <p className="library-facets">{spoken(parentOf(group.lecture.directory))}</p>
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
        </div>
      </div>
    </main>
  );
}
