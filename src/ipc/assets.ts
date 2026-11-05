/**
 * Images pasted into the notes, across the IPC boundary.
 *
 * The bytes go as the raw request body rather than inside JSON, where a screenshot would
 * cross as an array of numbers several times its size. Which lecture they belong to rides
 * in one header — see `crates/src-tauri/src/assets.rs`.
 */
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const AssetSaveSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("saved"), path: z.string().min(1) }),
  z.object({ outcome: z.literal("refused"), reason: z.enum(["notAnImage", "tooLarge"]) }),
]);

export type AssetSave = z.infer<typeof AssetSaveSchema>;

/**
 * JSON with everything outside ASCII written as `\uXXXX`.
 *
 * A header value must be ASCII, and a vault or course name need not be. JSON's own escapes
 * carry the characters through, and Rust's JSON parser brings them back.
 */
export function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * Keeps a pasted image in the lecture's `assets/` folder; resolves to where the notes
 * should point, or to why it was not kept.
 *
 * @throws {CommandError} if the lecture cannot be found or the write fails.
 */
export async function saveImage(vault: string, directory: string, bytes: Uint8Array): Promise<AssetSave> {
  const payload: unknown = await invoke("save_asset", bytes, {
    headers: { "x-nexus-lecture": asciiJson({ vault, directory }) },
  });

  return AssetSaveSchema.parse(payload);
}
