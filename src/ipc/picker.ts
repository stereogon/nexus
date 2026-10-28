/**
 * The native pickers, as the UI sees them.
 *
 * Thin wrappers so these `invoke` calls have the same validated shape as every other: a
 * string the person chose, or `null` because they cancelled. Cancelling is not a failure
 * and must never be reported as one.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

const ChosenPathSchema = z.string().nullable();

/** Asks the person to choose a vault folder. Resolves to `null` if they cancel. */
export async function pickVaultDirectory(): Promise<string | null> {
  const payload: unknown = await invoke("pick_vault_directory");

  return ChosenPathSchema.parse(payload);
}

/** Asks the person to choose a lecture document. Resolves to `null` if they cancel. */
export async function pickDocument(): Promise<string | null> {
  const payload: unknown = await invoke("pick_document");

  return ChosenPathSchema.parse(payload);
}
