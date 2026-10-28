/**
 * The folder picker, as the UI sees it.
 *
 * A thin wrapper so that the one `invoke` call has the same validated shape as every
 * other: a string the person chose, or `null` because they cancelled. Cancelling is not a
 * failure and must never be reported as one.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

const ChosenDirectorySchema = z.string().nullable();

/** Asks the person to choose a vault folder. Resolves to `null` if they cancel. */
export async function pickVaultDirectory(): Promise<string | null> {
  const payload: unknown = await invoke("pick_vault_directory");

  return ChosenDirectorySchema.parse(payload);
}
