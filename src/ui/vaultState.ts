/**
 * Which vault the window has open, if any: one union rather than flags, so "open" and
 * "failed" cannot both be true (see `App`'s note). Moved out of `App.tsx` on 2026-11-05,
 * with the two questions asked of it most, when that file reached the line limit.
 */
import type { CommandError, LectureRow, VaultSummary } from "../ipc/vault";

export type VaultState =
  | { readonly kind: "idle" }
  | { readonly kind: "open"; readonly summary: VaultSummary }
  | { readonly kind: "failed"; readonly error: CommandError };

const NO_LECTURES: readonly LectureRow[] = [];

/** The open vault's lectures; one shared empty list otherwise, so it is stable across renders. */
export function lecturesOf(state: VaultState): readonly LectureRow[] {
  return state.kind === "open" ? state.summary.lectures : NO_LECTURES;
}

/** The open vault's folder, or `null`. */
export function rootOf(state: VaultState): string | null {
  return state.kind === "open" ? state.summary.root : null;
}
