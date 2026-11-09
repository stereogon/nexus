/** The clipboard's text, read natively for ⌘⇧V (`clipboard.rs` says why). */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

/** What is on the clipboard as text, or `null` when there is none. */
export async function clipboardText(): Promise<string | null> {
  const parsed = z.string().nullable().safeParse(await invoke("clipboard_text"));

  return parsed.success ? parsed.data : null;
}
