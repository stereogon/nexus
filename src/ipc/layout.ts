/**
 * How wide this device shows the notes and the sidebar, and which layout it draws the window
 * in (Classic or Islands, 2026-11-14).
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

/** The window's layout, named as `lecture_fs::window_layout::WindowLayout` names it. */
export const WINDOW_LAYOUTS = ["classic", "islands"] as const;

export type WindowLayout = (typeof WINDOW_LAYOUTS)[number];

const WindowLayoutSchema = z.enum(WINDOW_LAYOUTS);

/** The layout last chosen on this device, or Classic. */
export async function lastWindowLayout(): Promise<WindowLayout> {
  const parsed = WindowLayoutSchema.safeParse(await invoke("last_window_layout"));

  return parsed.success ? parsed.data : "classic";
}

/** Records the chosen layout. Failing to record it costs the next launch, nothing more. */
export async function rememberWindowLayout(layout: WindowLayout): Promise<void> {
  await invoke("remember_window_layout", { layout });
}
