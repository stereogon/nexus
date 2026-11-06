/**
 * Where this device was in each lecture, and which lecture it had open.
 *
 * Per-device state (§3), in Application Support, never in the vault. Losing it costs a
 * scroll position, so every read answers "nowhere yet" rather than failing.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

/** A page counting from 1, and how far down it, as a fraction of its height. */
export const PositionSchema = z.object({
  page: z.number().int().positive(),
  offset: z.number().min(0).max(1),
});

export type Position = z.infer<typeof PositionSchema>;

/** Where this device last was in a lecture, or `null`. */
export async function lecturePosition(vault: string, directory: string): Promise<Position | null> {
  const parsed = PositionSchema.nullable().safeParse(await invoke("lecture_position", { vault, directory }));

  return parsed.success ? parsed.data : null;
}

/** Records where this device is in a lecture. Failing costs the next open, nothing more. */
export async function rememberPosition(vault: string, directory: string, view: Position): Promise<void> {
  await invoke("remember_position", { vault, directory, view });
}

/** The lecture this device last had open in the vault, or `null`. */
export async function lastLecture(vault: string): Promise<string | null> {
  const parsed = z.string().nullable().safeParse(await invoke("last_lecture", { vault }));

  return parsed.success ? parsed.data : null;
}
