/**
 * Whether a document's screening notice is shown on this device (2026-11-09). Asked not to
 * be shown again, it stays quiet for that document; kept beside the reading positions, in
 * Application Support, never in the vault.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

/** Whether `directory`'s notice was asked not to be shown again; anything unreadable is no. */
export async function noticeQuiet(vault: string, directory: string): Promise<boolean> {
  const parsed = z.boolean().safeParse(await invoke("notice_quiet", { vault, directory }));

  return parsed.success && parsed.data;
}

/** Stops showing `directory`'s notice on this device. */
export async function quietNotice(vault: string, directory: string): Promise<void> {
  await invoke("quiet_notice", { vault, directory });
}
