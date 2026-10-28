/**
 * The application shell: choose a vault, then see what is in it.
 *
 * # Why the state is one union and not four booleans
 *
 * `opening` and `failed` cannot both be true, and a union says so in the type rather than
 * in a comment. It also makes the render exhaustive — `noFallthroughCasesInSwitch` and
 * `noImplicitReturns` are both on, so a state added later without a branch is a compile
 * error rather than a blank window.
 */
import { useCallback, useState } from "react";

import { pickVaultDirectory } from "./ipc/picker";
import { asCommandError, openVault, type CommandError, type VaultSummary } from "./ipc/vault";
import { LectureList } from "./ui/LectureList";

type VaultState =
  | { readonly kind: "idle" }
  | { readonly kind: "opening" }
  | { readonly kind: "open"; readonly summary: VaultSummary }
  | { readonly kind: "failed"; readonly error: CommandError };

function Failure({ error }: { readonly error: CommandError }) {
  return (
    <div className="card error">
      <div className="code">{error.code}</div>
      <div>{error.remediation}</div>
    </div>
  );
}

export function App() {
  const [state, setState] = useState<VaultState>({ kind: "idle" });

  const choose = useCallback(() => {
    void (async () => {
      let chosen: string | null;

      try {
        chosen = await pickVaultDirectory();
      } catch (thrown: unknown) {
        setState({ kind: "failed", error: asCommandError(thrown) });

        return;
      }

      // Cancelling is not a failure, and leaving the previous state alone is the whole
      // point: someone who opens the picker by accident keeps the vault they had.
      if (chosen === null) {
        return;
      }

      setState({ kind: "opening" });

      try {
        setState({ kind: "open", summary: await openVault(chosen) });
      } catch (thrown: unknown) {
        setState({ kind: "failed", error: asCommandError(thrown) });
      }
    })();
  }, []);

  return (
    <div className="app">
      <div className="titlebar" />
      <main className="content">
        <h1>Nexus</h1>
        <p className="subtitle">Study your lectures beside your notes, entirely offline.</p>

        <button onClick={choose} disabled={state.kind === "opening"} type="button">
          {state.kind === "open" ? "Open another vault" : "Open a vault"}
        </button>

        {state.kind === "failed" && <Failure error={state.error} />}
        {state.kind === "open" && <LectureList summary={state.summary} />}
      </main>
    </div>
  );
}
