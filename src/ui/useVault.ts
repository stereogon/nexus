/**
 * The open vault: restoring the one remembered, choosing another, and running a change
 * against it and re-reading it from disk. Moved out of `App` on 2026-11-07, when the
 * search window's wiring took the shell past 300 lines; this is the one job of keeping
 * `state` true to the vault on disk.
 */
import { useCallback, useEffect, useState } from "react";

import { pickVaultDirectory } from "../ipc/picker";
import { asCommandError, openVault, rememberVault, type CommandError, type VaultSummary } from "../ipc/vault";
import type { VaultState } from "./vaultState";

export function useVault(
  restored: VaultSummary | null,
  notice: { readonly show: (text: string | null) => void },
  /** Called when another vault is chosen, before it opens. */
  onChosen: () => void,
): {
  readonly state: VaultState;
  /** Why the last change to the vault could not be made, shown until it is dismissed. */
  readonly failure: CommandError | null;
  readonly dismissFailure: () => void;
  readonly busy: boolean;
  /** Runs an action that changes the vault, then re-reads the vault from disk. */
  readonly against: (vault: string, act: () => Promise<string | null>) => void;
  /** Picks a vault folder and opens it. */
  readonly choose: () => void;
} {
  const [state, setState] = useState<VaultState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandError | null>(null);
  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  // Folded into `state` once it arrives, rather than rendering from two sources. The
  // functional update is what makes that safe: it fills an *idle* shell and leaves any
  // other state alone, so someone who clicks "Open a vault" before the restore lands keeps
  // the vault they chose.
  useEffect(() => {
    if (restored === null) {
      return;
    }

    setState((current) =>
      current.kind === "idle"
        ? { kind: "open", summary: restored }
        : current,
    );
  }, [restored]);

  const against = useCallback(
    (vault: string, act: () => Promise<string | null>) => {
      void (async () => {
        setBusy(true);
        setFailure(null);

        try {
          const note = await act();

          // Re-scanned rather than having rows patched in place: the vault on disk is the
          // truth, and a list maintained by editing drifts from it the first time anything
          // changes a lecture without going through this window.
          setState({ kind: "open", summary: await openVault(vault) });
          notice.show(note);
        } catch (thrown: unknown) {
          // A change that could not be made leaves the vault open, said in a notice. It used
          // to close the vault and show the welcome screen with the error, so a name already
          // taken threw someone out of their vault (reported 2026-11-09). Re-read in case
          // the change got part of the way; only a vault that cannot be read at all closes.
          setFailure(asCommandError(thrown));

          try {
            setState({ kind: "open", summary: await openVault(vault) });
          } catch (unreadable: unknown) {
            setState({ kind: "failed", error: asCommandError(unreadable) });
          }
        } finally {
          setBusy(false);
        }
      })();
    },
    [notice],
  );

  const choose = useCallback(() => {
    void (async () => {
      setBusy(true);

      try {
        const chosen = await pickVaultDirectory();

        // Cancelling is not a failure, and leaving the previous state alone is the whole
        // point: someone who opens the picker by accident keeps the vault they had.
        if (chosen !== null) {
          onChosen();

          const summary = await openVault(chosen);

          // Recorded only once the open has succeeded, so a folder that turns out not to be
          // a vault is not the one waiting on the next launch.
          await rememberVault(chosen);
          setState({ kind: "open", summary });
          notice.show(null);
        }
      } catch (thrown: unknown) {
        setState({ kind: "failed", error: asCommandError(thrown) });
      } finally {
        setBusy(false);
      }
    })();
  }, [notice, onChosen]);

  return { state, failure, dismissFailure, busy, against, choose };
}
