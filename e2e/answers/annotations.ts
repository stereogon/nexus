/**
 * The harness's answers about annotations: highlights, areas and sticky notes, kept in
 * memory for the length of the page. Split from `backend.ts` on 2026-11-05 when sticky
 * notes took it past 300 lines.
 */
import { z } from "zod";

import {
  AnnotationSchema,
  HighlightSemanticSchema,
  NormalizedRectSchema,
  type Annotation,
} from "../../src/ipc/annotations";
import type { Fixture } from "../fixture";
import { CommandFailure, InLecture, type Handlers } from "./shared";

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

const AddTextBox = InLecture.extend({
  note: z.object({ page: z.number().int().positive(), region: NormalizedRectSchema, text: z.string() }),
});

const EditTextBox = InLecture.extend({
  id: z.string(),
  edit: z.object({ region: NormalizedRectSchema.optional(), text: z.string().optional() }),
});

const RestoreAnnotation = InLecture.extend({ annotation: AnnotationSchema });

const RetagAnnotation = InLecture.extend({ id: z.string(), semantic: HighlightSemanticSchema });

export function annotationHandlers(fixture: Fixture): Handlers {
  const annotations = new Map<string, Annotation[]>(
    Object.entries(fixture.annotations).map(([directory, list]) => [directory, [...list]]),
  );
  let issued = 0;

  const held = (directory: string): Annotation[] => {
    const list = annotations.get(directory) ?? [];

    annotations.set(directory, list);

    return list;
  };

  return {
    load_annotations: (args) => {
      return held(InLecture.parse(args).directory);
    },
    add_highlight: (args) => {
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
    },
    add_area_highlight: (args) => {
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
    },
    add_text_box: (args) => {
      const { directory, note } = AddTextBox.parse(args);
      const text = note.text.trim();

      if (text === "") {
        throw new CommandFailure("ERR_INVALID_EXCERPT", "That note has no words in it.");
      }

      issued += 1;

      const now = new Date(Date.UTC(2026, 10, 5, 9, 0, issued)).toISOString();
      const added: Annotation = {
        kind: "textBox",
        id: `e2e-${String(issued)}`,
        page: note.page,
        region: note.region,
        text,
        createdAt: now,
        updatedAt: now,
      };

      held(directory).push(added);

      return added;
    },
    // Put back whole, keeping its id; one already there is answered as held, no change.
    restore_annotation: (args) => {
      const { directory, annotation } = RestoreAnnotation.parse(args);
      const list = held(directory);
      const there = list.find((each) => each.id === annotation.id);

      if (there !== undefined) {
        return there;
      }

      list.push(annotation);
      return annotation;
    },
    edit_text_box: (args) => {
      const { directory, id, edit } = EditTextBox.parse(args);
      const list = held(directory);
      const at = list.findIndex((annotation) => annotation.id === id);
      const before = list[at];

      if (before?.kind !== "textBox") {
        return null;
      }

      const after: Annotation = {
        ...before,
        region: edit.region ?? before.region,
        text: edit.text?.trim() ?? before.text,
      };

      list.splice(at, 1, after);

      return after;
    },
    remove_annotation: (args) => {
      const { directory, id } = RemoveAnnotation.parse(args);
      const list = held(directory);
      const at = list.findIndex((annotation) => annotation.id === id);

      return at === -1 ? null : (list.splice(at, 1)[0] ?? null);
    },
    retag_annotation: (args) => {
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
    },
  };
}
