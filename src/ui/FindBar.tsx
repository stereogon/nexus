/**
 * The find bar over the document: the words, how many matches, and previous / next.
 *
 * Enter goes to the next match and Shift-Enter to the previous, as in Safari and Preview;
 * Escape closes the bar and takes the marks off the pages.
 */
import { useEffect, useRef } from "react";

import type { Find } from "./useFind";

/** What the count says, in words. */
export function findStatus(find: Pick<Find, "query" | "matches" | "current" | "searching" | "failed">): string {
  if (find.query.trim() === "") {
    return "";
  }

  if (find.failed) {
    return "Could not read this document's text";
  }

  if (find.searching) {
    return "Searching…";
  }

  return find.matches.length === 0
    ? "No matches"
    : `${String((find.current ?? 0) + 1)} of ${String(find.matches.length)}`;
}

export function FindBar({ find }: { readonly find: Find }) {
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [find.focusKey]);

  const none = find.matches.length === 0;

  return (
    <div aria-label="Find in document" className="find-bar" role="search">
      <input
        aria-label="Find in document"
        onChange={(event) => {
          find.setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            find.step(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape") {
            event.preventDefault();
            find.close();
          }
        }}
        placeholder="Find in document"
        ref={field}
        type="search"
        value={find.query}
      />
      <span aria-live="polite" className="find-count">
        {findStatus(find)}
      </span>
      <button
        aria-label="Previous match"
        className="quiet"
        disabled={none}
        onClick={() => {
          find.step(-1);
        }}
        type="button"
      >
        ↑
      </button>
      <button
        aria-label="Next match"
        className="quiet"
        disabled={none}
        onClick={() => {
          find.step(1);
        }}
        type="button"
      >
        ↓
      </button>
      <button aria-label="Close find" className="quiet" onClick={find.close} type="button">
        ✕
      </button>
    </div>
  );
}
