/**
 * Stands in for the Rust side, inside the page, for a Playwright run.
 *
 * It answers the commands the window sends, from a `Fixture`, and keeps the changes a run
 * makes — highlights added and removed, lectures edited — in memory for the length of the
 * page. It is deliberately *not* a second implementation of the domain: it does not
 * normalise text, enforce bounds or write files. Those rules are Rust's and are tested in
 * Rust against real temporary vaults. What this exists to exercise is everything on the
 * window's side of the IPC boundary — which is where every layout bug so far has lived.
 *
 * Arguments are validated with Zod, the same as anything else crossing a boundary
 * (CLAUDE.md §4). A command this does not know is answered with a `CommandError`, so a
 * new command the window starts sending fails a run visibly instead of hanging it.
 */
import type { InvokeArgs } from "@tauri-apps/api/core";
import { z } from "zod";

import type { LectureRow } from "../src/ipc/vault";
import { annotationHandlers } from "./answers/annotations";
import { notesHandlers } from "./answers/notes";
import { searchHandlers } from "./answers/search";
import { CommandFailure, InLecture, type Handlers } from "./answers/shared";
import type { Fixture } from "./fixture";

export { CommandFailure } from "./answers/shared";

const EditLecture = InLecture.extend({
  edit: z.object({
    title: z.string(),
    course: z.string(),
    module: z.string(),
    week: z.string(),
    tags: z.array(z.string()),
  }),
});

/** A blank facet clears it, which is what the real command does with one. */
function facet(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

export function backend(fixture: Fixture): (command: string, args?: InvokeArgs) => unknown {
  let lectures: LectureRow[] = [...fixture.lectures];
  // Per-device, so kept for the page's life like the real file is kept between launches.
  let notesWidth: number | null = null;

  const vault: Handlers = {
    last_vault: () => fixture.vault,
    last_theme: () => "system",
    // Both answer `null`, as the real commands do. (In the `switch` this replaced,
    // `remember_vault` fell through to `remember_theme`'s return; a mechanical split gave
    // it an empty body, answering `undefined` — caught by reading the result.)
    remember_vault: () => null,
    remember_theme: () => null,
    last_notes_width: () => notesWidth,
    remember_notes_width: (args) => {
      notesWidth = z.object({ width: z.number().int() }).parse(args).width;

      return null;
    },
    importable_formats: () => ["pdf"],
    open_vault: () => ({ root: fixture.vault, lectures, skipped: [], unloadable: [] }),
    open_document: (args) => {
      const { directory } = InLecture.parse(args);

      // The path is the directory itself. The harness turns it into a URL that the
      // Playwright route answers with the generated PDF for that lecture.
      return { path: directory, bytes: 1, risks: [], needsAttention: false };
    },
    edit_lecture: (args) => {
      const { directory, edit } = EditLecture.parse(args);
      const before = lectures.find((lecture) => lecture.directory === directory);

      if (before === undefined) {
        throw new CommandFailure("ERR_E2E_NO_LECTURE", `No lecture at ${directory}.`);
      }

      const after: LectureRow = {
        ...before,
        title: edit.title.trim(),
        course: facet(edit.course),
        module: facet(edit.module),
        week: facet(edit.week),
        tags: edit.tags,
      };

      lectures = lectures.map((lecture) => (lecture === before ? after : lecture));

      return after;
    },
  };

  const answers: Handlers = { ...vault, ...annotationHandlers(fixture), ...notesHandlers(fixture), ...searchHandlers(fixture) };

  return (command, args) => {
    if (fixture.failing?.includes(command) === true) {
      throw new CommandFailure("ERR_E2E_FAILING", `The harness was told to fail "${command}".`);
    }

    const answer = answers[command];

    if (answer === undefined) {
      throw new CommandFailure(
        "ERR_E2E_UNMOCKED",
        `The Playwright harness does not answer "${command}". Add it to e2e/answers/.`,
      );
    }

    return answer(args);
  };
}
