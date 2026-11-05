/**
 * Searching the vault's notes and highlights as the person types in the sidebar.
 *
 * Waits until typing pauses, so a word typed quickly is one search rather than one per
 * letter, and drops any answer that arrives after a newer question was asked — otherwise
 * a slow search for `le` could land after a quick one for `leader` and replace it.
 * Fewer than two characters is not searched: one letter matches almost every line.
 */
import { useEffect, useState } from "react";

import { searchVault, type VaultSearch } from "../ipc/search";
import { asCommandError, type CommandError } from "../ipc/vault";

/** How long typing must pause before a search runs. */
export const SEARCH_PAUSE_MS = 200;

/** The shortest query searched. */
export const SEARCH_MIN_LENGTH = 2;

export function useVaultSearch(
  vault: string | null,
  directories: readonly string[],
  query: string,
): { readonly found: VaultSearch | null; readonly failure: CommandError | null } {
  const [found, setFound] = useState<VaultSearch | null>(null);
  const [failure, setFailure] = useState<CommandError | null>(null);
  const asked = query.trim();

  useEffect(() => {
    if (vault === null || asked.length < SEARCH_MIN_LENGTH) {
      setFound(null);
      setFailure(null);
      return undefined;
    }

    const session = { current: true };
    // Through a function for the reason `useAnnotations` gives: the flag is cleared from the
    // cleanup, which the type checker cannot follow.
    const live = () => session.current;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const answer = await searchVault(vault, directories, asked);

          if (live()) {
            setFound(answer);
            setFailure(null);
          }
        } catch (thrown: unknown) {
          if (live()) {
            setFound(null);
            setFailure(asCommandError(thrown));
          }
        }
      })();
    }, SEARCH_PAUSE_MS);

    return () => {
      session.current = false;
      window.clearTimeout(timer);
    };
  }, [vault, directories, asked]);

  return { found, failure };
}
