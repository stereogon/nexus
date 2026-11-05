/**
 * The harness's answers to the vault search and the highlights library.
 *
 * Answered from the fixture's seeded notes and highlights, not from what a run changes:
 * the journeys about finding things seed what they look for. Matching is a plain
 * case-insensitive `includes`, enough to put results on screen; the real rules — case
 * folding outside ASCII, snippet context, limits, damaged lectures — are Rust's and are
 * tested there against real vaults.
 */
import { z } from "zod";

import type { Fixture } from "../fixture";
import { type Handlers } from "./shared";

const InVault = z.object({ vault: z.string(), directories: z.array(z.string()) });

function snippet(text: string, query: string): { before: string; matched: string; after: string } | null {
  const at = text.toLowerCase().indexOf(query.toLowerCase());

  return at === -1
    ? null
    : { before: text.slice(0, at), matched: text.slice(at, at + query.length), after: text.slice(at + query.length) };
}

export function searchHandlers(fixture: Fixture): Handlers {
  return {
    search_vault: (args) => {
      const { directories } = InVault.parse(args);
      const query = z.object({ query: z.string() }).parse(args).query.trim();

      const lectures = directories.flatMap((directory) => {
        const notes = (fixture.notes?.[directory] ?? "").split("\n").flatMap((line, index) => {
          const found = snippet(line, query);

          return found === null ? [] : [{ line: index + 1, snippet: found }];
        });
        const marks = (fixture.annotations[directory] ?? []).flatMap((annotation) => {
          const words = annotation.kind === "textHighlight" ? annotation.quote : annotation.kind === "textBox" ? annotation.text : (annotation.caption ?? "");
          const found = snippet(words, query);

          return found === null
            ? []
            : [{ id: annotation.id, page: annotation.page, semantic: annotation.kind === "textBox" ? null : annotation.semantic, snippet: found }];
        });

        return notes.length === 0 && marks.length === 0 ? [] : [{ directory, notes, noteLines: notes.length, marks }];
      });

      return { lectures, unreadable: 0, truncated: false };
    },
    vault_highlights: (args) => {
      const { directories } = InVault.parse(args);

      return {
        lectures: directories.flatMap((directory) => {
          const annotations = fixture.annotations[directory] ?? [];

          return annotations.length === 0 ? [] : [{ directory, annotations }];
        }),
        unreadable: 0,
      };
    },
  };
}
