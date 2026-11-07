/**
 * The workspace shell: the sidebar, and the panes beside it.
 *
 * The layout is the redesign canvas's Workspace artboards — a 260px sidebar
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
 * `busy`, `folder` and `editing` sit outside that union on purpose. Each is orthogonal to
 * which vault is open, and folding them in would mean enumerating combinations that cannot
 * actually occur — an editing-with-no-vault state, a folder-in-a-failed-vault one.
 */
import { useCallback, useEffect, useState } from "react";

import { pickVaultDirectory } from "./ipc/picker";
import { asCommandError, openVault, rememberVault, type LectureRow } from "./ipc/vault";
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
import { parentOf, vaultNameOf } from "./ui/folders";
import { existingFolder, sidebarRows } from "./ui/sidebarRows";
import { SidebarIcon } from "./ui/icons";
import { useAddDocuments } from "./ui/useAddDocuments";
import { useErrorPanel } from "./ui/useErrorPanel";
import { useFinding } from "./ui/useFinding";
import { useItemActions } from "./ui/useItemActions";
import { useResumeLecture } from "./ui/useResumeLecture";
import { useNotice } from "./ui/useNotice";
import { useOpenLecture } from "./ui/useOpenLecture";
import { useRememberedVault } from "./ui/useRememberedVault";
import { useSidebar } from "./ui/useSidebar";
import { useTheme } from "./ui/useTheme";
import { lecturesOf, rootOf, type VaultState } from "./ui/vaultState";
import { Welcome } from "./ui/Welcome";

export function App() {
  const [state, setState] = useState<VaultState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  // The folder the sidebar shows; `""` is the top of the vault.
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<LectureRow | null>(null);
  const remembered = useRememberedVault();
  const reading = useOpenLecture();
  const appearance = useTheme();
  const notice = useNotice();
  const sidebar = useSidebar(state.kind === "open");
  const errorPanel = useErrorPanel(state.kind === "open");
  const root = rootOf(state);
  useResumeLecture(root, lecturesOf(state), reading.lecture?.lecture.directory ?? null, reading.open);
  const finding = useFinding(root, lecturesOf(state), query, reading);
  const openDirectory = reading.lecture?.lecture.directory ?? null;

  // Whatever opens — from the sidebar, a search, or on launch — the sidebar shows the
  // folder it is in, so the open item is always in the list beside it.
  useEffect(() => {
    if (openDirectory !== null) {
      setFolder(parentOf(openDirectory));
    }
  }, [openDirectory]);

  const goToFolder = useCallback((path: string) => {
    setFolder(path);
    setQuery("");
  }, []);

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

  const actions = useItemActions({ vault: root, folder, reading, against, onFolder: goToFolder });
  const { add, zone } = useAddDocuments(root, folder, busy, against);

  // One file read, so this is imperceptible -- and painting the empty state first would
  // read as the app having forgotten the vault and then remembered it.
  if (remembered.checking && state.kind === "idle") {
    return (
      <div className="app">
        <div className="window-strip" data-tauri-drag-region="" />
      </div>
    );
  }

  if (state.kind !== "open") {
    return (
      <div className="app">
        <div className="window-strip" data-tauri-drag-region="" />
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
  // Held to what the vault still has, so a folder removed in Finder steps up, not to nothing.
  const showing = existingFolder(summary, folder);

  return (
    <div className="app">
      {/* Beside the window's own buttons, only while the sidebar that holds the hide
          control is hidden; the leftmost header leaves room for both (`--lead-inset`). */}
      {!sidebar.shown && (
        <button
          aria-label="Show sidebar"
          className="chrome-icon sidebar-show"
          onClick={sidebar.toggle}
          title="Show sidebar"
          type="button"
        >
          <SidebarIcon />
        </button>
      )}

      <div className="panes" data-sidebar={sidebar.shown ? "shown" : "hidden"}>
        {sidebar.shown && (
          <Sidebar
            busy={busy || reading.opening}
            folder={showing}
            onEdit={setEditing}
            onFolder={goToFolder}
            onImport={add}
            onHide={sidebar.toggle}
            onChooseVault={choose}
            foot={{
              libraryShown: finding.library,
              onToggleLibrary: finding.toggleLibrary,
              onShowErrors: errorPanel.show,
              theme: appearance.theme,
              onChooseTheme: appearance.choose,
            }}
            onMake={actions.make}
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
            openDirectory={openDirectory}
            query={query}
            root={summary.root}
            rows={sidebarRows(summary, showing, query)}
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
            <div className="pane-head lead pane-strip" data-tauri-drag-region="" />
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
            folders={summary.folders}
            lecture={editing}
            onCancel={() => {
              setEditing(null);
            }}
            onSave={(edit, into) => {
              setEditing(null);
              actions.save(editing, edit, into);
            }}
            onDelete={() => {
              setEditing(null);
              actions.remove(editing);
            }}
            vaultName={vaultNameOf(summary.root)}
          />
        )}
        {errorPanel.open && <ErrorPanel onClose={errorPanel.close} />}
      </div>

      {zone.dragging && <DropOverlay formats={zone.formats} />}
    </div>
  );
}
