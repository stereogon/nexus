/**
 * The harness's answers for folders: making one, making a plain note, and moving an item.
 *
 * Kept as plain lists of paths, which is all the window can see of them. Which names are
 * usable, how a note's folder is named and what a move refuses are Rust's rules, tested in
 * `crates/src-tauri/tests/folders.rs` against real vaults; the harness copies only the
 * outcome the window has to cope with.
 */
import { z } from "zod";

import type { LectureRow } from "../../src/ipc/vault";
import { CommandFailure, type Handlers } from "./shared";

/** What the vault holds for the length of the page. */
export interface Held {
  lectures: LectureRow[];
  folders: string[];
  /**
   * Where each moved item started. The PDF the Playwright route serves is keyed by the
   * fixture's directory, and a real move takes the file with the folder, so a moved
   * document is still answered with the same pages.
   */
  movedFrom: Map<string, string>;
}

/** Every folder above each item, plus any the fixture names: what a vault walk would list. */
export function foldersOf(lectures: readonly LectureRow[], named: readonly string[]): string[] {
  const all = new Set(named);

  for (const lecture of lectures) {
    const parts = lecture.directory.split("/").slice(0, -1);

    parts.forEach((_, index) => all.add(parts.slice(0, index + 1).join("/")));
  }

  return [...all].sort();
}

const InFolder = z.object({ vault: z.string(), parent: z.string() });

function within(parent: string, name: string): string {
  return parent === "" ? name : `${parent}/${name}`;
}

function refuseTaken(held: Held, path: string): void {
  if (held.folders.includes(path) || held.lectures.some((lecture) => lecture.directory === path)) {
    throw new CommandFailure(
      "ERR_NAME_ALREADY_HERE",
      "Something with this name is already in this folder. Choose a different name.",
    );
  }
}

export function folderHandlers(held: Held): Handlers {
  return {
    create_folder: (args) => {
      const { parent, name } = InFolder.extend({ name: z.string() }).parse(args);
      const path = within(parent, name.trim());

      refuseTaken(held, path);
      held.folders = [...held.folders, path].sort();

      return path;
    },
    create_note: (args) => {
      const { parent, title } = InFolder.extend({ title: z.string() }).parse(args);
      const path = within(parent, title.trim().toLowerCase().replaceAll(/\s+/g, "-"));

      refuseTaken(held, path);

      const note: LectureRow = {
        directory: path,
        kind: "note",
        title: title.trim(),
        number: null,
        numberInTitle: null,
        sequence: `z${String(held.lectures.length)}`,
        course: null,
        module: null,
        week: null,
        tags: [],
        conversion: "notRequired",
        documentReady: false,
      };

      held.lectures = [...held.lectures, note];

      return note;
    },
    move_item: (args) => {
      const { directory, folder } = z
        .object({ vault: z.string(), directory: z.string(), folder: z.string() })
        .parse(args);
      const item = held.lectures.find((lecture) => lecture.directory === directory);

      if (item === undefined) {
        throw new CommandFailure("ERR_ITEM_NOT_FOUND", `No item at ${directory}.`);
      }

      const to = within(folder, directory.slice(directory.lastIndexOf("/") + 1));

      if (to !== directory) {
        refuseTaken(held, to);
      }

      const moved = { ...item, directory: to };

      held.movedFrom.set(to, held.movedFrom.get(directory) ?? directory);

      held.lectures = held.lectures.map((lecture) => (lecture === item ? moved : lecture));

      return { item: moved, placeLost: null };
    },
  };
}
