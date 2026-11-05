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

import { pickVaultDirectory } from "./ipc/picker";
import {
  asCommandError,
  editLecture,
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
import { EditorPanel } from "./ui/EditorPanel";
import { HighlightsLibrary } from "./ui/HighlightsLibrary";
import { ErrorPanel } from "./ui/ErrorPanel";
import { Reading } from "./ui/Reading";
import { SearchHits } from "./ui/SearchHits";
import { Sidebar } from "./ui/Sidebar";
import { sidebarRows, type GroupBy, type ThenBy } from "./ui/sidebarRows";
import { TitleBar } from "./ui/TitleBar";
import { useAddDocuments } from "./ui/useAddDocuments";
import { useErrorPanel } from "./ui/useErrorPanel";
import { useFinding } from "./ui/useFinding";
import { useNotice } from "./ui/useNotice";
import { useOpenLecture } from "./ui/useOpenLecture";
import { useRememberedVault } from "./ui/useRememberedVault";
import { useSidebar } from "./ui/useSidebar";
import { useTheme } from "./ui/useTheme";
import { Welcome } from "./ui/Welcome";

type VaultState =
  | { readonly kind: "idle" }
  | { readonly kind: "open"; readonly summary: VaultSummary }
  | { readonly kind: "failed"; readonly error: CommandError };

const NO_LECTURES: readonly LectureRow[] = [];

/** The open vault's lectures; one shared empty list otherwise, so it is stable across renders. */
function lecturesOf(state: VaultState): readonly LectureRow[] {
  return state.kind === "open" ? state.summary.lectures : NO_LECTURES;
}

export function App() {
  const [state, setState] = useState<VaultState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("folder");
  const [thenBy, setThenBy] = useState<ThenBy>("none");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<LectureRow | null>(null);
  const remembered = useRememberedVault();
  const reading = useOpenLecture();
  const appearance = useTheme();
  const notice = useNotice();
  const sidebar = useSidebar(state.kind === "open");
  const errorPanel = useErrorPanel(state.kind === "open");
  const finding = useFinding(state.kind === "open" ? state.summary.root : null, lecturesOf(state), query, reading);

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

        // The open lecture holds its own copy of the row, so renaming the lecture that is
        // on screen has to refresh it -- otherwise the breadcrumb and the viewer's title
        // keep the old name until it is closed and opened again.
        reading.refile(lecture.directory, saved);

        // Named after what changed, since one command does both. "Filed" in front of
        // someone who only corrected a title would read as though it had moved.
        return saved.title === lecture.title
          ? `Filed "${saved.title}".`
          : `Renamed to "${saved.title}".`;
      });
    },
    [against, editing, reading, state],
  );

  const { add, zone } = useAddDocuments(state.kind === "open" ? state.summary.root : null, busy, against);

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
        lecture={open?.lecture ?? editing ?? null}
        onCycleTheme={appearance.cycle}
        onToggleSidebar={sidebar.toggle}
        sidebarShown={sidebar.shown}
        errorsShown={errorPanel.open}
        onToggleErrors={errorPanel.toggle}
        libraryShown={finding.library}
        onToggleLibrary={finding.toggleLibrary}
        theme={appearance.theme}
      />

      <div className="panes">
        {sidebar.shown && (
          <Sidebar
            busy={busy || reading.opening}
            groupBy={groupBy}
            onEdit={setEditing}
            onGroupBy={setGroupBy}
            hits={
              finding.search.failure !== null ? (
                <Failure error={finding.search.failure} />
              ) : finding.search.found === null ? null : (
                <SearchHits found={finding.search.found} lectures={summary.lectures} onOpenAt={finding.goTo} />
              )
            }
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

        {finding.library ? (
          <HighlightsLibrary
            lectures={summary.lectures}
            onClose={finding.closeLibrary}
            onOpenAt={finding.goTo}
            vault={summary.root}
          />
        ) : open !== null ? (
          <Reading
            arrival={finding.arrival}
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

            <EmptyPane busy={busy} onAdd={add} onChooseVault={choose} />
          </main>
        )}

        {editing !== null && (
          <EditorPanel
            busy={busy}
            lecture={editing}
            onCancel={() => {
              setEditing(null);
            }}
            onSave={save}
          />
        )}
        {errorPanel.open && <ErrorPanel onClose={errorPanel.close} />}
      </div>

      {zone.dragging && <DropOverlay formats={zone.formats} />}
    </div>
  );
}
