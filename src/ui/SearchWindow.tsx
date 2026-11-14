/**
 * ⌘P: search everything, in a window over the workspace (redesign canvas, 2026-11-07).
 *
 * It replaced the search box in the 260px sidebar, which had no room for the words around
 * a match. Names, lines of notes and highlights are one list (`searchResults`): ↑ and ↓
 * move through it, Enter opens the chosen one, Escape or a click outside closes the window.
 * The field is a combobox and the list a listbox, so a screen reader follows the choice.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { Snippet, VaultSearch } from "../ipc/search";
import type { CommandError } from "../ipc/vault";
import { Failure } from "./Failure";
import { FolderIcon, NoteIcon, PageIcon } from "./icons";
import { GROUP_TITLE, searchResults, type SearchResult } from "./searchResults";
import { SEMANTIC_GLYPH, SEMANTIC_LABEL } from "./semantics";
import type { Listing } from "./sidebarRows";
import { SEARCH_MIN_LENGTH } from "./useVaultSearch";

/** A match in context, with the matched words marked. */
function SnippetText({ snippet }: { readonly snippet: Snippet }) {
  return (
    <span className="search-snippet">
      {snippet.before}
      <mark>{snippet.matched}</mark>
      {snippet.after}
    </span>
  );
}

function Look({ result }: { readonly result: SearchResult }) {
  switch (result.look) {
    case "folder":
      return <FolderIcon />;
    case "note":
      return <NoteIcon />;
    case "page":
      return <PageIcon />;
    case "document":
      return (
        <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" viewBox="0 0 16 16" width="16">
          <path d="M4 2h5.5l3 3v9h-8.5z M9.5 2v3h3" />
        </svg>
      );
    case "sticky":
      return <span className="search-glyph" data-semantic="sticky" title="Sticky note">✎</span>;
    case "key":
    case "definition":
    case "exam":
    case "question":
      return (
        <span className="search-glyph" data-semantic={result.look} title={SEMANTIC_LABEL[result.look]}>
          {SEMANTIC_GLYPH[result.look]}
        </span>
      );
  }
}

export function SearchWindow({
  listing,
  query,
  onQuery,
  found,
  failure,
  onChoose,
  onClose,
}: {
  readonly listing: Listing;
  readonly query: string;
  readonly onQuery: (text: string) => void;
  readonly found: VaultSearch | null;
  readonly failure: CommandError | null;
  readonly onChoose: (result: SearchResult) => void;
  readonly onClose: () => void;
}) {
  const asked = query.trim();
  const results = useMemo(() => (asked === "" ? [] : searchResults(listing, asked, found)), [listing, asked, found]);
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement | null>(null);
  const chosen = results[Math.min(active, results.length - 1)];

  // A new question starts at its first answer.
  useEffect(() => {
    setActive(0);
  }, [asked]);

  // Focus into the field on opening, and back where it was on closing, so a keyboard user
  // is not left at the top of the window.
  useEffect(() => {
    const came = document.activeElement;

    field.current?.focus();
    field.current?.select();

    return () => {
      if (came instanceof HTMLElement && came.isConnected) {
        came.focus();
      }
    };
  }, []);

  // The chosen result stays in view as ↑ and ↓ move through a long list.
  useEffect(() => {
    if (chosen !== undefined) {
      document.getElementById(`result-${chosen.key}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [chosen]);

  const move = (by: number) => {
    setActive((current) => Math.max(0, Math.min(results.length - 1, current + by)));
  };

  return (
    <div
      className="search-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div aria-label="Search everything" aria-modal="true" className="search-window" role="dialog">
        <label className="search-field">
          <span className="vh">Search everything</span>
          <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" viewBox="0 0 16 16" width="18">
            <circle cx="7" cy="7" r="4.6" />
            <path d="M10.5 10.5l3.2 3.2" />
          </svg>
          <input
            aria-activedescendant={chosen === undefined ? undefined : `result-${chosen.key}`}
            aria-autocomplete="list"
            aria-controls="search-results"
            aria-expanded={results.length > 0}
            onChange={(event) => {
              onQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              } else if (event.key === "Enter" && chosen !== undefined) {
                event.preventDefault();
                onChoose(chosen);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }
            }}
            placeholder="Search names, notes and highlights"
            ref={field}
            role="combobox"
            type="text"
            value={query}
          />
          <span className="kbd">esc</span>
        </label>

        <ul aria-label="Results" className="search-results" id="search-results" role="listbox">
          {results.map((result, index) => (
            <li key={result.key} role="presentation">
              {(index === 0 || results[index - 1]?.group !== result.group) && (
                <p aria-hidden="true" className="search-group">
                  {GROUP_TITLE[result.group]}
                </p>
              )}
              <div
                aria-selected={result === chosen}
                className="search-result"
                id={`result-${result.key}`}
                onClick={() => {
                  onChoose(result);
                }}
                onMouseMove={() => {
                  setActive(index);
                }}
                role="option"
                tabIndex={-1}
              >
                <span className="search-look">
                  <Look result={result} />
                </span>
                <span className="search-what">
                  <span className="search-title">
                    {result.title}
                    {result.detail !== "" && <span className="search-detail">{` · ${result.detail}`}</span>}
                  </span>
                  {result.snippet !== null && <SnippetText snippet={result.snippet} />}
                </span>
                {result.where !== "" && <span className="search-where">{result.where}</span>}
              </div>
            </li>
          ))}
        </ul>

        {failure !== null && <Failure error={failure} />}
        {asked === "" && <p className="search-empty">Type to search names, notes and highlights in every folder.</p>}
        {asked !== "" && results.length === 0 && (asked.length < SEARCH_MIN_LENGTH || found !== null) && (
          <p className="search-empty">{`Nothing matches “${asked}”.`}</p>
        )}
        {found !== null && found.unreadable > 0 && (
          <p className="search-empty">
            {found.unreadable === 1 ? "One item" : `${String(found.unreadable)} items`} could not be searched, because its notes or
            highlights could not be read. Opening it shows why.
          </p>
        )}
        {found?.truncated === true && <p className="search-empty">Showing the first results only. Type more to narrow the search.</p>}

        <div className="search-foot">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> to move
          </span>
          <span>
            <span className="kbd">↵</span> to open there
          </span>
        </div>
      </div>
    </div>
  );
}
