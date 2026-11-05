/**
 * A lecture's `notes.md`, across the IPC boundary.
 *
 * The rule that matters lives in Rust (`lecture_fs::notes_store`): a save says which
 * version it was based on, and a file that changed since — another device, another
 * editor — is answered with a conflict and what the file now holds, with nothing written.
 * A conflict is an outcome to handle, not an error, so it arrives as a value rather than a
 * rejection.
 */
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const NotesSchema = z.object({
  text: z.string(),
  /** Fingerprint of the bytes read. Sent back with the next save. */
  version: z.string().min(1),
});

export const NotesSaveSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("saved"), version: z.string().min(1) }),
  z.object({ outcome: z.literal("conflict"), onDisk: NotesSchema }),
]);

export type Notes = z.infer<typeof NotesSchema>;
export type NotesSave = z.infer<typeof NotesSaveSchema>;

/**
 * A lecture's notes and the version they were read at. A lecture with none yet comes back
 * empty rather than failing.
 *
 * @throws {CommandError} if the lecture cannot be read, or if `notes.md` is not text — in
 * which case it has been copied aside and nothing changed.
 */
export async function loadNotes(vault: string, directory: string): Promise<Notes> {
  const payload: unknown = await invoke("load_notes", { vault, directory });

  return NotesSchema.parse(payload);
}

/**
 * Saves a lecture's notes if the file is still at `basedOn`; otherwise says what it holds.
 *
 * @throws {CommandError} if the lecture cannot be read, if `notes.md` is not text, or if
 * the write fails — in which case the previous file is left exactly as it was.
 */
export async function saveNotes(
  vault: string,
  directory: string,
  text: string,
  basedOn: string,
): Promise<NotesSave> {
  const payload: unknown = await invoke("save_notes", { vault, directory, text, basedOn });

  return NotesSaveSchema.parse(payload);
}
