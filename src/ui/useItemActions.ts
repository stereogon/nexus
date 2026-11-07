/**
 * Making notes and folders, and saving an edit that may also move an item.
 *
 * Out of `App` for the reason `useAddDocuments` is: each is one change to the vault, run
 * through `against` so the sidebar then shows what is on disk, and `App` is the shell
 * rather than the place each change is spelled out.
 */
import { useCallback } from "react";

import {
  createFolder,
  createNote,
  deleteItem,
  editLecture,
  moveItem,
  type LectureEdit,
  type LectureRow,
} from "../ipc/vault";
import { parentOf, spoken } from "./folders";
import type { Making } from "./sidebarRows";
import type { Opening } from "./useOpenLecture";

export function useItemActions({
  vault,
  folder,
  reading,
  against,
  onFolder,
}: {
  readonly vault: string | null;
  /** The folder showing, where anything made goes. */
  readonly folder: string;
  readonly reading: Pick<Opening, "open" | "refile" | "lecture" | "close">;
  readonly against: (vault: string, act: () => Promise<string | null>) => void;
  readonly onFolder: (path: string) => void;
}): {
  readonly make: (making: Making, name: string) => void;
  readonly save: (item: LectureRow, edit: LectureEdit, folder: string) => void;
  /** Moves an item into the vault's `.trash`, closing it first if it is open. */
  readonly remove: (item: LectureRow) => void;
} {
  const make = useCallback(
    (making: Making, name: string) => {
      if (vault === null) {
        return;
      }

      against(vault, async () => {
        if (making === "folder") {
          // Stepped into, since a folder is made to put something in.
          onFolder(await createFolder(vault, folder, name));
          return null;
        }

        // Opened straight away: a note is made to be written in.
        reading.open(vault, await createNote(vault, folder, name));
        return null;
      });
    },
    [against, folder, onFolder, reading, vault],
  );

  const save = useCallback(
    (item: LectureRow, edit: LectureEdit, into: string) => {
      if (vault === null) {
        return;
      }

      against(vault, async () => {
        const saved = await editLecture(vault, item.directory, edit);
        const moving = into !== parentOf(item.directory);
        const moved = moving ? await moveItem(vault, saved.directory, into) : null;
        const now = moved?.item ?? saved;

        if (reading.lecture?.lecture.directory === item.directory) {
          // A moved document's file is somewhere else now, so it is opened again from
          // there rather than kept by a path that no longer exists. An edit in place keeps
          // what is on screen, since the bytes have not changed.
          if (moving) {
            reading.open(vault, now);
          } else {
            reading.refile(item.directory, now);
          }
        }

        const where = spoken(into) || "the top of the vault";
        const said = moving
          ? `Moved "${now.title}" to ${where}.`
          : now.title === item.title
            ? `Saved "${now.title}".`
            : `Renamed to "${now.title}".`;

        // The move happened either way; the place it was left open at is what was lost.
        const lost = moved === null ? null : moved.placeLost;

        return lost === null ? said : `${said} ${lost.remediation}`;
      });
    },
    [against, reading, vault],
  );

  const remove = useCallback(
    (item: LectureRow) => {
      if (vault === null) {
        return;
      }

      // Closed before the move, so nothing on screen is left reading files that have gone.
      if (reading.lecture?.lecture.directory === item.directory) {
        reading.close();
      }

      against(vault, async () => {
        await deleteItem(vault, item.directory);

        return `Deleted "${item.title}". It is in the vault's hidden .trash folder; drag it out in Finder to bring it back.`;
      });
    },
    [against, reading, vault],
  );

  return { make, save, remove };
}
