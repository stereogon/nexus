/**
 * The application shell: choose a vault, add lectures, file them, see them grouped.
 *
 * # Why the state is one union and not four booleans
 *
 * `open` and `failed` cannot both be true, and a union says so in the type rather than in
 * a comment. It also makes the render exhaustive — `noFallthroughCasesInSwitch` and
 * `noImplicitReturns` are both on, so a state added later without a branch is a compile
 * error rather than a blank window.
 *
 * `busy`, `groupBy` and `editing` sit outside that union on purpose. Each is orthogonal to
 * which vault is open, and folding them in would mean enumerating combinations that cannot
 * actually occur — an editing-with-no-vault state, a grouped-but-failed one.
 */
import { useCallback, useEffect, useState } from "react";

import { pickDocument, pickVaultDirectory } from "./ipc/picker";
import {
  asCommandError,
  editLecture,
  importDocument,
  openVault,
  rememberVault,
  type CommandError,
  type LectureEdit,
  type LectureRow,
  type VaultSummary,
} from "./ipc/vault";
import { DropOverlay } from "./ui/DropOverlay";
import { GroupPicker } from "./ui/GroupPicker";
import { importEach, noteFor } from "./ui/dropped";
import { LectureEditor } from "./ui/LectureEditor";
import { LectureList, type GroupBy } from "./ui/LectureList";
import { PdfViewer } from "./ui/PdfViewer";
import { useDropZone } from "./ui/useDropZone";
import { useMetaShortcut } from "./ui/useMetaShortcut";
import { useOpenLecture } from "./ui/useOpenLecture";
import { useRememberedVault } from "./ui/useRememberedVault";

type VaultState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "open";
      readonly summary: VaultSummary;
      readonly note: string | null;
    }
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
  const [busy, setBusy] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [editing, setEditing] = useState<LectureRow | null>(null);
  const remembered = useRememberedVault();
  const reading = useOpenLecture();

  // Folded into `state` once it arrives, rather than rendering from two sources. The
  // functional update is what makes that safe: it fills an *idle* shell and leaves any
  // other state alone, so someone who clicks "Open a vault" before the restore lands keeps
  // the vault they chose.
  useEffect(() => {
    const restored = remembered.summary;

    if (restored === null) {
      return;
    }

    setState((current) =>
      current.kind === "idle"
        ? { kind: "open", summary: restored, note: null }
        : current,
    );
  }, [remembered.summary]);

  /** Runs an action that changes the vault, then re-reads the vault from disk. */
  const against = useCallback(
    (vault: string, act: () => Promise<string | null>) => {
      void (async () => {
        setBusy(true);

        try {
          const note = await act();

          // Re-scanned rather than having rows patched in place: the vault on disk is the
          // truth, and a list maintained by editing drifts from it the first time anything
          // changes a lecture without going through this window.
          setState({ kind: "open", summary: await openVault(vault), note });
        } catch (thrown: unknown) {
          setState({ kind: "failed", error: asCommandError(thrown) });
        } finally {
          setBusy(false);
        }
      })();
    },
    [],
  );

  const choose = useCallback(() => {
    void (async () => {
      setBusy(true);

      try {
        const chosen = await pickVaultDirectory();

        // Cancelling is not a failure, and leaving the previous state alone is the whole
        // point: someone who opens the picker by accident keeps the vault they had.
        if (chosen !== null) {
          setEditing(null);

          const summary = await openVault(chosen);

          // Recorded only once the open has succeeded, so a folder that turns out not to be
          // a vault is not the one waiting on the next launch.
          await rememberVault(chosen);
          setState({ kind: "open", summary, note: null });
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

    against(vault, async () => {
      const file = await pickDocument();

      return file === null ? null : noteFor(await importDocument(vault, file));
    });
  }, [against, state]);

  const dropped = useCallback(
    (paths: readonly string[]) => {
      if (state.kind !== "open") {
        return;
      }

      const vault = state.summary.root;

      against(vault, () =>
        importEach(vault, paths, importDocument, asCommandError),
      );
    },
    [against, state],
  );

  const save = useCallback(
    (edit: LectureEdit) => {
      if (state.kind !== "open" || editing === null) {
        return;
      }

      const vault = state.summary.root;
      const lecture = editing;

      setEditing(null);
      against(vault, async () => {
        const saved = await editLecture(vault, lecture.directory, edit);

        // Named after what changed, since one command does both. "Filed" in front of
        // someone who only corrected a title would read as though it had moved.
        return saved.title === lecture.title
          ? `Filed "${saved.title}".`
          : `Renamed to "${saved.title}".`;
      });
    },
    [against, editing, state],
  );

  const zone = useDropZone(dropped);

  // The canvas's drop state promises ⌘O opens the browser, so it has to.
  useMetaShortcut("o", state.kind === "open" && !busy, add);

  // One file read, so this is imperceptible -- and painting the empty state first would
  // read as the app having forgotten the vault and then remembered it.
  if (remembered.checking && state.kind === "idle") {
    return (
      <div className="app">
        <div className="titlebar" />
      </div>
    );
  }

  // The viewer replaces the shell rather than sitting inside it. The canvas's workspace is
  // the document and the notes beside it, not a document inside a vault browser -- and the
  // notes pane is Milestone 4, so for now the document has the window.
  if (reading.lecture !== null) {
    return (
      <div className="app">
        <div className="titlebar" />
        <PdfViewer
          document={reading.lecture.document}
          onClose={reading.close}
          title={reading.lecture.title}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="titlebar" />
      <main className="content">
        <h1>Nexus</h1>
        <p className="subtitle">
          Study your lectures beside your notes, entirely offline.
        </p>

        <div className="actions">
          <button disabled={busy} onClick={choose} type="button">
            {state.kind === "open" ? "Open another vault" : "Open a vault"}
          </button>
          {state.kind === "open" && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={add}
                type="button"
              >
                Add a lecture
              </button>
              <GroupPicker onChange={setGroupBy} value={groupBy} />
            </>
          )}
        </div>

        {state.kind === "idle" && remembered.lost !== null && (
          <Failure error={remembered.lost} />
        )}
        {reading.failure !== null && <Failure error={reading.failure} />}
        {state.kind === "failed" && <Failure error={state.error} />}
        {zone.failure !== null && <Failure error={zone.failure} />}
        {state.kind === "open" && (
          <>
            {state.note !== null && <p className="note">{state.note}</p>}
            {editing !== null && (
              <LectureEditor
                busy={busy}
                lecture={editing}
                onCancel={() => {
                  setEditing(null);
                }}
                onSave={save}
              />
            )}
            <LectureList
              busy={busy || reading.opening}
              groupBy={groupBy}
              onEdit={setEditing}
              onOpen={(lecture) => {
                reading.open(state.summary.root, lecture);
              }}
              summary={state.summary}
            />
          </>
        )}
      </main>
      {zone.dragging && state.kind === "open" && (
        <DropOverlay formats={zone.formats} />
      )}
    </div>
  );
}
