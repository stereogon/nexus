/**
 * The reorganize commands: say what would happen, then do it.
 *
 * Validated with Zod like every other payload crossing the boundary — see `./vault` for
 * why that layer exists at all.
 *
 * # The folder layout is a projection, not the truth
 *
 * §3: `sequence` and the manifest's facets are authoritative; the folder names are a
 * *derived projection* kept for Finder and Files-app legibility. So nothing here changes
 * what a lecture means. It changes where its folder sits, and a lecture that does not move
 * is none the worse for it.
 */
import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";

import { CommandErrorSchema } from "./vault";

/** The default pattern: a folder per course, with the week in each lecture's name. */
export const DEFAULT_TEMPLATE = "{course}/{week}-{title}";

/** One folder move. */
export const MoveRowSchema = z.object({
  from: z.string(),
  to: z.string(),
});

/**
 * Why a lecture cannot be filed, matching `name_of` in `reorganize.rs`.
 *
 * `nameUnusable` and `patternNeedsFacets` are deliberately separate: one means a name
 * rendered to nothing a folder can hold, the other that the pattern files by facets this
 * lecture has not been given. They want opposite things done about them, and they were one
 * value until 2026-10-28, which meant a lecture with no week was told to fix its title.
 */
export const BlockReasonSchema = z.enum([
  "targetOccupied",
  "sharedTarget",
  "nameUnusable",
  "patternNeedsFacets",
  "cycleUnbreakable",
]);

/**
 * One lecture that cannot be filed.
 *
 * `wanted` is null when the template produced no usable name at all — a lecture with no
 * week under a template that needs one. There is nowhere it wanted to be, and an empty
 * string would have been a worse answer than none.
 */
export const BlockedRowSchema = z.object({
  directory: z.string(),
  wanted: z.string().nullable(),
  reason: BlockReasonSchema,
  remediation: z.string(),
});

/** What a reorganize would do. This is the dry-run preview. */
export const ReorganizePreviewSchema = z.object({
  moves: z.array(MoveRowSchema),
  blocked: z.array(BlockedRowSchema),
  unchanged: z.number().int().nonnegative(),
});

/** What a reorganize actually did. */
export const ReorganizeResultSchema = z.object({
  moved: z.array(MoveRowSchema),
  blocked: z.array(BlockedRowSchema),
  complete: z.boolean(),
  // `stoppedBy`, not `stopped_by`: the Rust struct is `rename_all = "camelCase"`. Pinned
  // by `fixtures/reorganize.json` rather than by having got it right here.
  stoppedBy: CommandErrorSchema.nullable(),
  // Why the remembered reading positions could not follow the moves. Separate from
  // `stoppedBy`, which is about the folders: the folders moved either way, and what is
  // lost here is the page each lecture was open at.
  positionsLost: CommandErrorSchema.nullable(),
});

export type MoveRow = z.infer<typeof MoveRowSchema>;
export type BlockReason = z.infer<typeof BlockReasonSchema>;
export type BlockedRow = z.infer<typeof BlockedRowSchema>;
export type ReorganizePreview = z.infer<typeof ReorganizePreviewSchema>;
export type ReorganizeResult = z.infer<typeof ReorganizeResultSchema>;

/**
 * Says what filing the vault under `template` would do, without touching anything.
 *
 * @throws {CommandError} if the vault cannot be read or the template is not usable.
 */
export async function previewReorganize(
  vault: string,
  template: string,
): Promise<ReorganizePreview> {
  const payload: unknown = await invoke("preview_reorganize", {
    vault,
    template,
  });

  return ReorganizePreviewSchema.parse(payload);
}

/**
 * Files the vault's folders under `template`.
 *
 * Rust plans again rather than taking the preview back, because a plan is a snapshot of a
 * vault and only the disk knows whether it is still true. So what comes back is what
 * actually happened, which may differ from the preview if a facet changed in between.
 *
 * Resolves even when something went wrong part-way: the folders have moved by then, so
 * `complete`, `stoppedBy` and `positionsLost` carry what is now true rather than an error
 * that would say none of it happened. Only a failure *before* any move rejects.
 *
 * @throws {CommandError} if the vault cannot be read or the template is not usable.
 */
export async function applyReorganize(
  vault: string,
  template: string,
): Promise<ReorganizeResult> {
  const payload: unknown = await invoke("apply_reorganize", {
    vault,
    template,
  });

  return ReorganizeResultSchema.parse(payload);
}
