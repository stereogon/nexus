/**
 * What the importer accepts, asked rather than assumed.
 *
 * The canvas's drop zone lists five format chips. Writing that list here would make it a
 * second opinion about what Nexus imports, free to drift from `DocumentFormat` the day a
 * format is added or dropped — the same class of bug `fixtures/` exists to prevent. So the
 * window asks, and holds no opinion of its own.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

/**
 * Lowercase extensions, without a leading dot, in the order a person would list them.
 *
 * Non-empty on purpose: an empty list would mean Nexus imports nothing, which is never
 * true, and a loud failure here is better than a drop zone that quietly shows no formats.
 */
export const ImportableFormatsSchema = z.array(z.string().min(1)).min(1);

export type ImportableFormats = z.infer<typeof ImportableFormatsSchema>;

/**
 * Asks which document formats can be imported.
 *
 * @throws {CommandError} if the answer is not a non-empty list of extensions.
 */
export async function importableFormats(): Promise<ImportableFormats> {
  const payload: unknown = await invoke("importable_formats");

  return ImportableFormatsSchema.parse(payload);
}
