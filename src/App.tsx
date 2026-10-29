/**
 * The workspace shell: the title bar, the sidebar, and the pane beside it.
 *
 * The layout is the canvas's Workspace artboards — a 40px title bar over a 264px sidebar
 * and the document pane. Before a vault is open there is no workspace to draw, so that is
 * a separate screen (`Welcome`) rather than a state of this one.
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
import { EmptyPane } from "./ui/EmptyPane";
import { Failure } from "./ui/Failure";
import { Notice } from "./ui/Notice";
import { importEach, noteFor } from "./ui/dropped";
import { LectureEditor } from "./ui/LectureEditor";
import { PdfViewer } from "./ui/PdfViewer";
import { Sidebar } from "./ui/Sidebar";
import { sidebarRows, type GroupBy, type ThenBy } from "./ui/sidebarRows";
import { TitleBar } from "./ui/TitleBar";
import { useDropZone } from "./ui/useDropZone";
import { useMetaShortcut } from "./ui/useMetaShortcut";
import { useNotice } from "./ui/useNotice";
import { useOpenLecture } from "./ui/useOpenLecture";
import { useRememberedVault } from "./ui/useRememberedVault";
import { useTheme } from "./ui/useTheme";
import { Welcome } from "./ui/Welcome";

type VaultState =
  | { readonly kind: "idle" }
  | { readonly kind: "open"; readonly summary: VaultSummary }
  | { readonly kind: "failed"; readonly error: CommandError };

export function App() {
  const [state, setState] = useState<VaultState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("folder");
  const [thenBy, setThenBy] = useState<ThenBy>("none");
  const [query, setQuery] = useState("");
  const [sidebarShown, setSidebarShown] = useState(true);
  const [editing, setEditing] = useState<LectureRow | null>(null);
  const remembered = useRememberedVault();
  const reading = useOpenLecture();
  const appearance = useTheme();
  const notice = useNotice();

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
        ? { kind: "open", summary: restored }
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
          setState({ kind: "open", summary: await openVault(vault) });
          notice.show(note);
        } catch (thrown: unknown) {
          setState({ kind: "failed", error: asCommandError(thrown) });
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
          setEditing(null);

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
  }, [notice]);

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

  if (state.kind !== "open") {
    return (
      <div className="app">
        <div className="titlebar" />
        <Welcome
          busy={busy}
          failures={[
            ...(state.kind === "failed" ? [state.error] : []),
            ...(remembered.lost === null ? [] : [remembered.lost]),
          ]}
          onChoose={choose}
        />
      </div>
    );
  }

  const summary = state.summary;
  const open = reading.lecture;

  return (
    <div className="app">
      <TitleBar
        lecture={editing ?? open?.lecture ?? null}
        onCycleTheme={appearance.cycle}
        onToggleSidebar={() => {
          setSidebarShown(!sidebarShown);
        }}
        sidebarShown={sidebarShown}
        theme={appearance.theme}
      />

      <div className="panes">
        {sidebarShown && (
          <Sidebar
            busy={busy || reading.opening}
            groupBy={groupBy}
            onEdit={setEditing}
            onGroupBy={setGroupBy}
            onOpen={(lecture) => {
              reading.open(summary.root, lecture);
            }}
            onQuery={setQuery}
            onThenBy={setThenBy}
            openDirectory={open?.lecture.directory ?? null}
            query={query}
            root={summary.root}
            thenBy={thenBy}
            rows={sidebarRows(summary.lectures, groupBy, thenBy, query)}
            skipped={summary.skipped}
            unloadable={summary.unloadable}
          />
        )}

        {open !== null ? (
          <PdfViewer
            directory={open.lecture.directory}
            document={open.document}
            onClose={reading.close}
            title={open.lecture.title}
            vault={summary.root}
          />
        ) : (
          <main className="pane">
            {notice.text !== null && (
              <Notice onDismiss={notice.dismiss} text={notice.text} />
            )}
            {reading.failure !== null && <Failure error={reading.failure} />}
            {zone.failure !== null && <Failure error={zone.failure} />}

            {editing === null ? (
              <EmptyPane busy={busy} onAdd={add} onChooseVault={choose} />
            ) : (
              <LectureEditor
                busy={busy}
                lecture={editing}
                onCancel={() => {
                  setEditing(null);
                }}
                onSave={save}
              />
            )}
          </main>
        )}
      </div>

      {zone.dragging && <DropOverlay formats={zone.formats} />}
    </div>
  );
}
