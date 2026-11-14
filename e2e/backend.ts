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

import { WINDOW_LAYOUTS } from "../src/ipc/layout";
import type { LectureRow } from "../src/ipc/vault";
import { annotationHandlers } from "./answers/annotations";
import { folderHandlers, foldersOf, type Held } from "./answers/folders";
import { notesHandlers } from "./answers/notes";
import { searchHandlers } from "./answers/search";
import { CommandFailure, InLecture, type Handlers } from "./answers/shared";
import type { Fixture } from "./fixture";

export { CommandFailure } from "./answers/shared";

/** As `lecture_fs::pane_width::Pane` accepts it: anything else is refused there too. */
const Pane = z.object({ pane: z.enum(["notes", "sidebar"]) });

const EditLecture = InLecture.extend({
  edit: z.object({
    title: z.string(),
    number: z.string(),
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
  const held: Held = {
    lectures: [...fixture.lectures],
    folders: foldersOf(fixture.lectures, fixture.folders ?? []),
    movedFrom: new Map(),
  };
  // Per-device, so kept for the page's life like the real file is kept between launches.
  const paneWidths = new Map<string, number>();
  const positions = new Map(Object.entries(fixture.positions ?? {}));
  let lastLecture = fixture.lastLecture ?? null;
  let layout = fixture.layout ?? "classic";
  // Documents whose notice was asked not to be shown again; per-device, like the positions.
  const quietNotices = new Set<string>();

  const vault: Handlers = {
    last_vault: () => fixture.vault,
    last_theme: () => "system",
    // Both answer `null`, as the real commands do. (In the `switch` this replaced,
    // `remember_vault` fell through to `remember_theme`'s return; a mechanical split gave
    // it an empty body, answering `undefined` — caught by reading the result.)
    remember_vault: () => null,
    remember_theme: () => null,
    last_window_layout: () => layout,
    remember_window_layout: (args) => {
      layout = z.object({ layout: z.enum(WINDOW_LAYOUTS) }).parse(args).layout;
      return null;
    },
    last_pane_width: (args) => paneWidths.get(Pane.parse(args).pane) ?? null,
    lecture_position: (args) => positions.get(InLecture.parse(args).directory) ?? null,
    remember_position: (args) => {
      const { directory, view } = InLecture.extend({
        view: z.object({ page: z.number().int().positive(), offset: z.number().min(0).max(1) }),
      }).parse(args);

      positions.set(directory, view);
      lastLecture = directory;
      return null;
    },
    last_lecture: () => lastLecture,
    remember_pane_width: (args) => {
      const { pane, width } = Pane.extend({ width: z.number().int() }).parse(args);

      paneWidths.set(pane, width);

      return null;
    },
    importable_formats: () => ["pdf"],
    open_vault: () => ({
      root: fixture.vault,
      lectures: held.lectures,
      folders: held.folders,
      skipped: [],
      unloadable: [],
    }),
    open_document: (args) => {
      const { directory } = InLecture.parse(args);

      // The path is the directory the fixture gave it, moved or not. The harness turns it
      // into a URL that the Playwright route answers with the generated PDF for it.
      const risks = fixture.risks?.[directory] ?? [];

      return {
        path: held.movedFrom.get(directory) ?? directory,
        bytes: 1,
        risks,
        needsAttention: risks.some((risk) => risk.severity === "notable"),
      };
    },
    clipboard_text: () => fixture.clipboard ?? null,
    notice_quiet: (args) => quietNotices.has(InLecture.parse(args).directory),
    quiet_notice: (args) => {
      quietNotices.add(InLecture.parse(args).directory);
      return null;
    },
    edit_lecture: (args) => {
      const { directory, edit } = EditLecture.parse(args);
      const before = held.lectures.find((lecture) => lecture.directory === directory);

      if (before === undefined) {
        throw new CommandFailure("ERR_E2E_NO_LECTURE", `No lecture at ${directory}.`);
      }

      const number = edit.number.trim() === "" ? null : edit.number.trim();
      // Placing a numbered lecture among the others is Rust's, and tested there; the
      // harness keeps the row's order as it was.
      const after: LectureRow = {
        ...before,
        title: edit.title.trim(),
        number,
        numberInTitle: number === null ? before.numberInTitle : null,
        course: facet(edit.course),
        module: facet(edit.module),
        week: facet(edit.week),
        tags: edit.tags,
      };

      held.lectures = held.lectures.map((lecture) => (lecture === before ? after : lecture));

      return after;
    },
  };

  const answers: Handlers = {
    ...vault,
    ...folderHandlers(held),
    ...annotationHandlers(fixture),
    ...notesHandlers(fixture),
    ...searchHandlers(fixture),
  };

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
