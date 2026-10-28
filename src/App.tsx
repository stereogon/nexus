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
import { useCallback, useState } from "react";

import { pickDocument, pickVaultDirectory } from "./ipc/picker";
import {
  asCommandError,
  importDocument,
  openVault,
  setLectureFacets,
  type CommandError,
  type FacetEdit,
  type LectureRow,
  type VaultSummary,
} from "./ipc/vault";
import { DropOverlay } from "./ui/DropOverlay";
import { noteFor, noteForDrop, type DropOutcome } from "./ui/dropped";
import { FacetEditor } from "./ui/FacetEditor";
import { LectureList, type GroupBy } from "./ui/LectureList";
import { useDropZone } from "./ui/useDropZone";
import { useMetaShortcut } from "./ui/useMetaShortcut";

type VaultState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "open";
      readonly summary: VaultSummary;
      readonly note: string | null;
    }
  | { readonly kind: "failed"; readonly error: CommandError };

const GROUPINGS: readonly (readonly [GroupBy, string])[] = [
  ["none", "Nothing"],
  ["course", "Course"],
  ["module", "Module"],
  ["week", "Week"],
];

/**
 * The grouping a `<select>` value names.
 *
 * Matched against the list the options were drawn from rather than asserted with `as`:
 * the value is a string as far as the DOM is concerned, and claiming otherwise would be
 * exactly the unchecked cast §4 rules out.
 */
function groupingFrom(value: string): GroupBy {
  return GROUPINGS.find(([name]) => name === value)?.[0] ?? "none";
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
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [editing, setEditing] = useState<LectureRow | null>(null);

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
          setState({
            kind: "open",
            summary: await openVault(chosen),
            note: null,
          });
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

  /**
   * Imports everything dropped on the window, one file at a time.
   *
   * Sequential rather than concurrent: an import allocates a folder name from the
   * document's title, so two files landing together could race for the same one. Slower by
   * exactly the amount that makes it correct.
   *
   * Each failure is caught per file. One screenshot among four slide decks must not discard
   * the news that the decks are in — §1.4 — so the outcomes are collected and reported
   * together rather than thrown on the first refusal.
   */
  const dropped = useCallback(
    (paths: readonly string[]) => {
      if (state.kind !== "open") {
        return;
      }

      const vault = state.summary.root;

      against(vault, async () => {
        const outcomes: DropOutcome[] = [];

        for (const path of paths) {
          try {
            outcomes.push({
              kind: "added",
              lecture: await importDocument(vault, path),
            });
          } catch (thrown: unknown) {
            outcomes.push({ kind: "refused", error: asCommandError(thrown) });
          }
        }

        return noteForDrop(outcomes);
      });
    },
    [against, state],
  );

  const file = useCallback(
    (facets: FacetEdit) => {
      if (state.kind !== "open" || editing === null) {
        return;
      }

      const vault = state.summary.root;
      const lecture = editing;

      setEditing(null);
      against(vault, async () => {
        const filed = await setLectureFacets(vault, lecture.directory, facets);

        return `Filed "${filed.title}".`;
      });
    },
    [against, editing, state],
  );

  const zone = useDropZone(dropped);

  // The canvas's drop state promises ⌘O opens the browser, so it has to.
  useMetaShortcut("o", state.kind === "open" && !busy, add);

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
              <label className="field inline">
                <span>Group by</span>
                <select
                  onChange={(event) => {
                    setGroupBy(groupingFrom(event.target.value));
                  }}
                  value={groupBy}
                >
                  {GROUPINGS.map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        {state.kind === "failed" && <Failure error={state.error} />}
        {zone.failure !== null && <Failure error={zone.failure} />}
        {state.kind === "open" && (
          <>
            {state.note !== null && <p className="note">{state.note}</p>}
            {editing !== null && (
              <FacetEditor
                busy={busy}
                lecture={editing}
                onCancel={() => {
                  setEditing(null);
                }}
                onSave={file}
              />
            )}
            <LectureList
              busy={busy}
              groupBy={groupBy}
              onEdit={setEditing}
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
