/**
 * The font this device draws the window in (2026-11-14): the theme's own, Mono or System
 * (Readable, Atkinson Hyperlegible, until 2026-11-15).
 *
 * Per-device state (§3), kept beside the theme in Application Support, as the theme is.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

/** The choices, named as `lecture_fs::font::Font` names them. */
export const FONTS = ["theme", "mono", "system"] as const;

export type Font = (typeof FONTS)[number];

const FontSchema = z.enum(FONTS);

/** The font last chosen on this device, or the theme's. */
export async function lastFont(): Promise<Font> {
  const parsed = FontSchema.safeParse(await invoke("last_font"));

  return parsed.success ? parsed.data : "theme";
}

/** Records the chosen font. Failing to record it costs the next launch, nothing more. */
export async function rememberFont(font: Font): Promise<void> {
  await invoke("remember_font", { font });
}
