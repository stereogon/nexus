/**
 * The application shell: choose a vault, add lectures to it, see what is in it.
 *
 * # Why the state is one union and not four booleans
 *
 * `opening` and `failed` cannot both be true, and a union says so in the type rather than
 * in a comment. It also makes the render exhaustive — `noFallthroughCasesInSwitch` and
 * `noImplicitReturns` are both on, so a state added later without a branch is a compile
 * error rather than a blank window.
 *
 * `busy` sits outside that union on purpose: "an action is in flight" is orthogonal to
 * which vault is open, and folding it in would mean an importing-with-a-vault state and an
 * importing-without-one state that cannot actually both exist.
 */
import { useCallback, useState } from "react";

import { pickDocument, pickVaultDirectory } from "./ipc/picker";
import {
  asCommandError,
  importDocument,
  openVault,
  type CommandError,
  type LectureRow,
  type VaultSummary,
} from "./ipc/vault";
import { LectureList } from "./ui/LectureList";

type VaultState =
  | { readonly kind: "idle" }
  | { readonly kind: "open"; readonly summary: VaultSummary; readonly note: string | null }
  | { readonly kind: "failed"; readonly error: CommandError };

/**
 * What to say after an import.
 *
 * An import that could not convert still succeeded, so this reports the state rather than
 * treating it as a failure — and says what it means for the person, not what the enum is
 * called.
 */
function noteFor(lecture: LectureRow): string {
  switch (lecture.conversion) {
    case "failed":
      return `Added "${lecture.title}", but it could not be converted to a PDF. The original is kept, so you can still take notes beside it.`;
    case "queued":
      return `Added "${lecture.title}". It needs LibreOffice to be converted before it can be opened, and none was found.`;
    case "converting":
      return `Added "${lecture.title}". It is still converting.`;
    case "ready":
    case "notRequired":
      return `Added "${lecture.title}".`;
  }
}

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
  const [busy, setBusy] = useState(false);

  const choose = useCallback(() => {
    void (async () => {
      setBusy(true);

      try {
        const chosen = await pickVaultDirectory();

        // Cancelling is not a failure, and leaving the previous state alone is the whole
        // point: someone who opens the picker by accident keeps the vault they had.
        if (chosen !== null) {
          setState({ kind: "open", summary: await openVault(chosen), note: null });
        }
      } catch (thrown: unknown) {
        setState({ kind: "failed", error: asCommandError(thrown) });
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const add = useCallback(() => {
    if (state.kind !== "open") {
      return;
    }

    const vault = state.summary.root;

    void (async () => {
      setBusy(true);

      try {
        const file = await pickDocument();

        if (file !== null) {
          const added = await importDocument(vault, file);

          // Re-scanned rather than having the new row spliced in: the vault on disk is the
          // truth, and a list maintained by appending drifts from it the first time
          // anything changes a lecture without going through this button.
          setState({ kind: "open", summary: await openVault(vault), note: noteFor(added) });
        }
      } catch (thrown: unknown) {
        setState({ kind: "failed", error: asCommandError(thrown) });
      } finally {
        setBusy(false);
      }
    })();
  }, [state]);

  return (
    <div className="app">
      <div className="titlebar" />
      <main className="content">
        <h1>Nexus</h1>
        <p className="subtitle">Study your lectures beside your notes, entirely offline.</p>

        <div className="actions">
          <button onClick={choose} disabled={busy} type="button">
            {state.kind === "open" ? "Open another vault" : "Open a vault"}
          </button>
          {state.kind === "open" && (
            <button className="secondary" onClick={add} disabled={busy} type="button">
              Add a lecture
            </button>
          )}
        </div>

        {state.kind === "failed" && <Failure error={state.error} />}
        {state.kind === "open" && (
          <>
            {state.note !== null && <p className="note">{state.note}</p>}
            <LectureList summary={state.summary} />
          </>
        )}
      </main>
    </div>
  );
}
