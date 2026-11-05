/**
 * Searching the vault, and the highlights library: what Rust's `search` commands send.
 *
 * Both take the lecture directories the window holds from opening the vault. The shapes
 * are pinned by `fixtures/search.json`, which Rust writes from the real commands.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

import { AnnotationSchema, HighlightSemanticSchema } from "./annotations";

/** A match in context; the three pieces join back into the original text. */
export const SnippetSchema = z.object({ before: z.string(), matched: z.string(), after: z.string() });

export const VaultSearchSchema = z.object({
  lectures: z.array(
    z.object({
      directory: z.string(),
      notes: z.array(z.object({ line: z.number().int().positive(), snippet: SnippetSchema })),
      noteLines: z.number().int().nonnegative(),
      marks: z.array(
        z.object({
          id: z.string(),
          page: z.number().int().positive(),
          semantic: HighlightSemanticSchema.nullable(),
          snippet: SnippetSchema,
        }),
      ),
    }),
  ),
  unreadable: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const VaultMarksSchema = z.object({
  lectures: z.array(z.object({ directory: z.string(), annotations: z.array(AnnotationSchema) })),
  unreadable: z.number().int().nonnegative(),
});

export type Snippet = z.infer<typeof SnippetSchema>;
export type VaultSearch = z.infer<typeof VaultSearchSchema>;
export type VaultMarks = z.infer<typeof VaultMarksSchema>;

/**
 * Finds `query` in the notes and highlights of `directories`, ignoring case.
 *
 * @throws {CommandError} if the vault cannot be opened. A lecture that cannot be read is
 * counted in `unreadable`, not thrown.
 */
export async function searchVault(vault: string, directories: readonly string[], query: string): Promise<VaultSearch> {
  return VaultSearchSchema.parse(await invoke("search_vault", { vault, directories, query }));
}

/**
 * Every highlight and sticky note on `directories`, by lecture.
 *
 * @throws {CommandError} as `searchVault`.
 */
export async function vaultHighlights(vault: string, directories: readonly string[]): Promise<VaultMarks> {
  return VaultMarksSchema.parse(await invoke("vault_highlights", { vault, directories }));
}
