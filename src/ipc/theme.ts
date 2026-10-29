/**
 * The theme this device is set to.
 *
 * Per-device state (§3), so it lives beside the last-opened vault in Application Support
 * rather than in the vault or in browser storage — a laptop set to dark and a tablet left
 * on the system theme are not a conflict anyone should have to reconcile.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

/** The three choices, matching `Theme` in `lecture-core`. */
export const ThemeSchema = z.enum(["system", "light", "dark"]);

export type Theme = z.infer<typeof ThemeSchema>;

/**
 * The recorded theme, or `system`.
 *
 * Never throws for a stored value nobody can parse: Rust already answers `system` for
 * that, and this validates anyway because §4 says every payload crossing IPC is validated
 * before use, however trustworthy its source looks.
 */
export async function lastTheme(): Promise<Theme> {
  const parsed = ThemeSchema.safeParse(await invoke("last_theme"));

  return parsed.success ? parsed.data : "system";
}

/** Records the chosen theme. Failing to record it costs the next launch, nothing more. */
export async function rememberTheme(theme: Theme): Promise<void> {
  await invoke("remember_theme", { name: theme });
}
