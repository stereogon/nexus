/**
 * Reopens the vault this device had open last.
 *
 * # Why the shell waits for this
 *
 * `checking` is true until the answer is known, and the shell renders nothing in that
 * window. It is one file read, so it is imperceptible — and the alternative is visibly
 * worse: the empty "Open a vault" state would paint first and then be replaced, which
 * reads as the app having forgotten and then remembered.
 *
 * # Why a failure is reported rather than ignored
 *
 * Nothing recorded and a vault that has moved both arrive as `null`, and both mean the
 * same thing to a person: choose a vault. But a vault that is *there* and will not open is
 * different — it was working last launch — so that one is carried out as `lost` and shown
 * as a note. §1.4: being returned to the picker without a word would read as the app
 * having lost the vault.
 */
import { useEffect, useState } from "react";

import {
  asCommandError,
  lastVault,
  openVault,
  type CommandError,
  type VaultSummary,
} from "../ipc/vault";

export interface RememberedVault {
  /** Still looking. The shell holds its render rather than flashing the empty state. */
  readonly checking: boolean;
  /** The vault that was reopened, if one was. */
  readonly summary: VaultSummary | null;
  /** Why the remembered vault could not be reopened, if it could not. */
  readonly lost: CommandError | null;
}

const LOOKING: RememberedVault = {
  checking: true,
  summary: null,
  lost: null,
};

const NOTHING: RememberedVault = {
  checking: false,
  summary: null,
  lost: null,
};

export function useRememberedVault(): RememberedVault {
  const [state, setState] = useState<RememberedVault>(LOOKING);

  useEffect(() => {
    // A mutable object rather than a local `let`, for the reason `useDropZone` records: the
    // cleanup assigns from a closure the type checker cannot follow, and a plain flag reads
    // to it as always false.
    const session = { cancelled: false };

    const settle = (next: RememberedVault) => {
      if (!session.cancelled) {
        setState(next);
      }
    };

    void (async () => {
      try {
        const path = await lastVault();

        if (path === null) {
          settle(NOTHING);

          return;
        }

        settle({ checking: false, summary: await openVault(path), lost: null });
      } catch (thrown: unknown) {
        settle({ checking: false, summary: null, lost: asCommandError(thrown) });
      }
    })();

    return () => {
      session.cancelled = true;
    };
  }, []);

  return state;
}
