/**
 * Moving an item or a folder to another folder. Split from `vault.ts` on 2026-11-09, when
 * folders became movable too and that file passed the line limit.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

import { CommandErrorSchema, LectureRowSchema } from "./vault";

/** An item after a move, and why its remembered place could not follow it, if it could not. */
export const MovedItemSchema = z.object({
  item: LectureRowSchema,
  placeLost: CommandErrorSchema.nullable(),
});

export type MovedItem = z.infer<typeof MovedItemSchema>;

/**
 * Moves the item at `directory` into `folder` (`""` for the top of the vault).
 *
 * @throws {CommandError} if the item or folder is gone, or the folder already holds
 * something of that name — never by writing over it.
 */
export async function moveItem(vault: string, directory: string, folder: string): Promise<MovedItem> {
  const payload: unknown = await invoke("move_item", { vault, directory, folder });

  return MovedItemSchema.parse(payload);
}

export const MovedFolderSchema = z.object({
  folder: z.string(),
  placeLost: CommandErrorSchema.nullable(),
});

export type MovedFolder = z.infer<typeof MovedFolderSchema>;

/**
 * Moves the folder `folder`, with everything in it, into `into` (`""` for the top of the
 * vault) (2026-11-09).
 *
 * @throws {CommandError} if either folder is gone, the folder would go inside itself or too
 * deep, or `into` already holds that name — never by writing over it.
 */
export async function moveFolder(vault: string, folder: string, into: string): Promise<MovedFolder> {
  const payload: unknown = await invoke("move_folder", { vault, folder, into });

  return MovedFolderSchema.parse(payload);
}
