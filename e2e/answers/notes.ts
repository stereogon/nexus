/**
 * The harness's answers about notes and pasted images. Split from `backend.ts` on
 * 2026-11-05 when sticky notes took it past 300 lines.
 */
import { z } from "zod";

import type { Fixture } from "../fixture";
import { InLecture, type Handlers } from "./shared";

const SaveNotes = InLecture.extend({ text: z.string(), basedOn: z.string() });

export function notesHandlers(fixture: Fixture): Handlers {
  // Notes and their versions, with the real command's rule: a save based on anything but
  // the current version writes nothing and answers with what is there.
  const notes = new Map<string, { text: string; version: string }>(
    Object.entries(fixture.notes ?? {}).map(([directory, text]) => [directory, { text, version: "seeded" }]),
  );
  let revisions = 0;
  let notesOpenFor = "";
  let pastes = 0;
  const notesOf = (directory: string) => notes.get(directory) ?? { text: "", version: "empty" };

  return {
    load_notes: (args) => {
      notesOpenFor = InLecture.parse(args).directory;

      return notesOf(notesOpenFor);
    },
    save_asset: (args) => {
      const bytes = args instanceof Uint8Array ? args : new Uint8Array();
      const png = [0x89, 0x50, 0x4e, 0x47].every((byte, at) => bytes[at] === byte);

      if (!png || notesOpenFor === "") {
        return { outcome: "refused", reason: "notAnImage" };
      }

      pastes += 1;

      return { outcome: "saved", path: `assets/20261105-101530-pasted${String(pastes)}.png` };
    },
    save_notes: (args) => {
      const { directory, text, basedOn } = SaveNotes.parse(args);
      const current = notesOf(directory);

      if (current.version !== basedOn) {
        return { outcome: "conflict", onDisk: current };
      }

      revisions += 1;
      const version = `r${String(revisions)}`;

      notes.set(directory, { text, version });

      return { outcome: "saved", version };
    },
  };
}
