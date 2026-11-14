/**
 * The tone this device draws documents' pages in (2026-11-14): as printed, sepia, dusk or
 * night.
 *
 * Per-device state (§3), kept beside the theme in Application Support, as the theme is.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

/** The choices, named as `lecture_fs::page_tone::PageTone` names them. */
export const PAGE_TONES = ["printed", "sepia", "dusk", "night"] as const;

export type PageTone = (typeof PAGE_TONES)[number];

const PageToneSchema = z.enum(PAGE_TONES);

/** The tone last chosen on this device, or as printed. */
export async function lastPageTone(): Promise<PageTone> {
  const parsed = PageToneSchema.safeParse(await invoke("last_page_tone"));

  return parsed.success ? parsed.data : "printed";
}

/** Records the chosen tone. Failing to record it costs the next launch, nothing more. */
export async function rememberPageTone(tone: PageTone): Promise<void> {
  await invoke("remember_page_tone", { tone });
}
