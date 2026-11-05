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

import {
  HighlightSemanticSchema,
  NormalizedRectSchema,
  type Annotation,
} from "../src/ipc/annotations";
import type { LectureRow } from "../src/ipc/vault";
import type { Fixture } from "./fixture";

const InLecture = z.object({ vault: z.string(), directory: z.string() });

const AddHighlight = InLecture.extend({
  highlight: z.object({
    page: z.number().int().positive(),
    semantic: HighlightSemanticSchema,
    quote: z.string(),
    rects: z.array(NormalizedRectSchema).min(1),
  }),
});

const AddArea = InLecture.extend({
  area: z.object({
    page: z.number().int().positive(),
    semantic: HighlightSemanticSchema,
    region: NormalizedRectSchema,
  }),
});

const RemoveAnnotation = InLecture.extend({ id: z.string() });

const SaveNotes = InLecture.extend({ text: z.string(), basedOn: z.string() });

const RetagAnnotation = InLecture.extend({ id: z.string(), semantic: HighlightSemanticSchema });

const EditLecture = InLecture.extend({
  edit: z.object({
    title: z.string(),
    course: z.string(),
    module: z.string(),
    week: z.string(),
    tags: z.array(z.string()),
  }),
});

/** The shape the window's `asCommandError` expects of a rejection. */
export class CommandFailure extends Error {
  constructor(
    readonly code: string,
    readonly remediation: string,
  ) {
    super(remediation);
  }
}

/** A blank facet clears it, which is what the real command does with one. */
function facet(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

export function backend(fixture: Fixture): (command: string, args?: InvokeArgs) => unknown {
  let lectures: LectureRow[] = [...fixture.lectures];
  const annotations = new Map<string, Annotation[]>(
    Object.entries(fixture.annotations).map(([directory, list]) => [directory, [...list]]),
  );
  let issued = 0;

  // Notes and their versions, with the real command's rule: a save based on anything but
  // the current version writes nothing and answers with what is there.
  const notes = new Map<string, { text: string; version: string }>(
    Object.entries(fixture.notes ?? {}).map(([directory, text]) => [directory, { text, version: "seeded" }]),
  );
  let revisions = 0;
  const notesOf = (directory: string) => notes.get(directory) ?? { text: "", version: "empty" };

  const held = (directory: string): Annotation[] => {
    const list = annotations.get(directory) ?? [];

    annotations.set(directory, list);

    return list;
  };

  return (command, args) => {
    switch (command) {
      case "last_vault":
        return fixture.vault;
      case "last_theme":
        return "system";
      case "remember_vault":
      case "remember_theme":
        return null;
      case "importable_formats":
        return ["pdf"];
      case "open_vault":
        return { root: fixture.vault, lectures, skipped: [], unloadable: [] };

      case "open_document": {
        const { directory } = InLecture.parse(args);

        // The path is the directory itself. The harness turns it into a URL that the
        // Playwright route answers with the generated PDF for that lecture.
        return { path: directory, bytes: 1, risks: [], needsAttention: false };
      }

      case "load_annotations":
        return held(InLecture.parse(args).directory);

      case "add_highlight": {
        const { directory, highlight } = AddHighlight.parse(args);
        const now = new Date(Date.UTC(2026, 10, 5, 9, 0, issued)).toISOString();

        issued += 1;

        const added: Annotation = {
          kind: "textHighlight",
          id: `e2e-${String(issued)}`,
          ...highlight,
          createdAt: now,
          updatedAt: now,
        };

        held(directory).push(added);

        return added;
      }

      case "add_area_highlight": {
        const { directory, area } = AddArea.parse(args);
        const now = new Date(Date.UTC(2026, 10, 5, 9, 0, issued)).toISOString();

        issued += 1;

        const added: Annotation = {
          kind: "areaHighlight",
          id: `e2e-${String(issued)}`,
          ...area,
          createdAt: now,
          updatedAt: now,
        };

        held(directory).push(added);

        return added;
      }

      case "remove_annotation": {
        const { directory, id } = RemoveAnnotation.parse(args);
        const list = held(directory);
        const at = list.findIndex((annotation) => annotation.id === id);

        return at === -1 ? null : (list.splice(at, 1)[0] ?? null);
      }

      case "retag_annotation": {
        const { directory, id, semantic } = RetagAnnotation.parse(args);
        const list = held(directory);
        const at = list.findIndex((annotation) => annotation.id === id);
        const before = list[at];

        // No highlight with that id -- a text box included -- answers `null`, as the real
        // command does.
        if (before === undefined || before.kind === "textBox") {
          return null;
        }

        const after: Annotation = { ...before, semantic };

        list.splice(at, 1, after);

        return after;
      }

      case "load_notes":
        return notesOf(InLecture.parse(args).directory);

      case "save_notes": {
        const { directory, text, basedOn } = SaveNotes.parse(args);
        const current = notesOf(directory);

        if (current.version !== basedOn) {
          return { outcome: "conflict", onDisk: current };
        }

        revisions += 1;
        const version = `r${String(revisions)}`;

        notes.set(directory, { text, version });

        return { outcome: "saved", version };
      }

      case "edit_lecture": {
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
      }

      default:
        throw new CommandFailure(
          "ERR_E2E_UNMOCKED",
          `The Playwright harness does not answer "${command}". Add it to e2e/backend.ts.`,
        );
    }
  };
}
