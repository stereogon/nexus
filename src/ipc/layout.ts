/**
 * How wide this device shows the notes and the sidebar.
 *
 * Per-device state (§3), kept beside the theme in Application Support rather than in the
 * vault or browser storage: a laptop screen and an external monitor want different widths,
 * and neither choice should follow the vault to the other.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

/** A pane whose width can be dragged, named as `lecture_fs::pane_width::Pane` names it. */
export type Pane = "notes" | "sidebar";

const WidthSchema = z.number().int().positive().nullable();

/** The width last chosen for `pane`, in CSS pixels, or `null` for the default. */
export async function lastPaneWidth(pane: Pane): Promise<number | null> {
  const parsed = WidthSchema.safeParse(await invoke("last_pane_width", { pane }));

  return parsed.success ? parsed.data : null;
}

/** Records the chosen width. Failing to record it costs the next launch, nothing more. */
export async function rememberPaneWidth(pane: Pane, width: number): Promise<void> {
  await invoke("remember_pane_width", { pane, width: Math.round(width) });
}
