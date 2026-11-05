/**
 * Every error the window has shown since it opened, for the error panel (⌘0).
 *
 * Recorded where an error is *shown* — `Failure` — rather than where it is caught, because
 * "what went wrong that I saw" is what the panel answers, and a failure's card disappears
 * the moment the next attempt succeeds. Nothing is lost by that: every error the person is
 * told about goes through `Failure`.
 *
 * Kept in memory only, for this window's life. An entry is a code and a fixed remediation
 * sentence — nothing a person typed or named — so there is no private material in it, but
 * there is also no reason to write it anywhere: the log in `~/Library/Logs/Nexus` is the
 * record that survives a restart.
 *
 * A module-level store read with `useSyncExternalStore`, the standard shape for state that
 * lives outside React and is written from wherever an error is drawn.
 */
import type { CommandError } from "../ipc/vault";

export interface LoggedError {
  readonly at: Date;
  readonly error: CommandError;
}

/** Enough to cover a bad evening; the oldest go first. */
export const ERROR_LOG_LIMIT = 100;

let entries: readonly LoggedError[] = [];
// By identity: a card re-rendered, or mounted twice by React's development checks, is the
// same error shown once, not two.
let noted = new WeakSet<CommandError>();
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Records an error as shown now. Showing the same one again records nothing. */
export function noteError(error: CommandError, at: Date = new Date()): void {
  if (noted.has(error)) {
    return;
  }

  noted.add(error);
  entries = [{ at, error }, ...entries].slice(0, ERROR_LOG_LIMIT);
  changed();
}

/** Empties the list. */
export function clearErrors(): void {
  entries = [];
  noted = new WeakSet();
  changed();
}

/** The errors shown so far, newest first. The same array until something changes. */
export function shownErrors(): readonly LoggedError[] {
  return entries;
}

/** Calls `listener` whenever the list changes; returns the way to stop. */
export function onErrorsChanged(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
