/**
 * How wide this device shows the notes.
 *
 * Per-device state (§3), kept beside the theme in Application Support rather than in the
 * vault or browser storage: a laptop screen and an external monitor want different widths,
 * and neither choice should follow the vault to the other.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

const WidthSchema = z.number().int().positive().nullable();

/** The width last chosen, in CSS pixels, or `null` for the default. */
export async function lastNotesWidth(): Promise<number | null> {
  const parsed = WidthSchema.safeParse(await invoke("last_notes_width"));

  return parsed.success ? parsed.data : null;
}

/** Records the chosen width. Failing to record it costs the next launch, nothing more. */
export async function rememberNotesWidth(width: number): Promise<void> {
  await invoke("remember_notes_width", { width: Math.round(width) });
}
