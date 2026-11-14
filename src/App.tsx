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
import { useCallback, useEffect, useRef, useState } from "react";

import type { LectureRow } from "./ipc/vault";
import { DropOverlay } from "./ui/DropOverlay";
import { EmptyPane } from "./ui/EmptyPane";
import { Failure } from "./ui/Failure";
import { PaneDivider } from "./ui/PaneDivider";
import { Notice } from "./ui/Notice";
import { EditorPanel } from "./ui/EditorPanel";
import { HighlightsLibrary } from "./ui/HighlightsLibrary";
import { ErrorPanel } from "./ui/ErrorPanel";
import { Reading } from "./ui/Reading";
import { Sidebar } from "./ui/Sidebar";
import { SidebarFoot } from "./ui/SidebarFoot";
import { nameOf, parentOf, vaultNameOf } from "./ui/folders";
import { existingFolder, sidebarRows } from "./ui/sidebarRows";
import { useAddDocuments } from "./ui/useAddDocuments";
import { useErrorPanel } from "./ui/useErrorPanel";
import { useFinding } from "./ui/useFinding";
import { useItemActions } from "./ui/useItemActions";
import { useResumeLecture } from "./ui/useResumeLecture";
import { useNotice } from "./ui/useNotice";
import { useOpenLecture } from "./ui/useOpenLecture";
import { useRememberedVault } from "./ui/useRememberedVault";
import { useSearchWindow } from "./ui/useSearchWindow";
import { useSidebar } from "./ui/useSidebar";
import { useSidebarWidth } from "./ui/useSidebarWidth";
import { useTheme } from "./ui/useTheme";
import { useFont } from "./ui/useFont";
import { useWindowLayout } from "./ui/useWindowLayout";
import { WindowBar } from "./ui/WindowBar";
import { lecturesOf, rootOf } from "./ui/vaultState";
import { useVault } from "./ui/useVault";
import { headingMeta } from "./notes/pageHeading";
import { Welcome } from "./ui/Welcome";
import { WorkspaceSearch } from "./ui/WorkspaceSearch";

export function App() {
  // The folder the sidebar shows; `""` is the top of the vault.
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<LectureRow | null>(null);
  const remembered = useRememberedVault();
  const reading = useOpenLecture();
  const appearance = useTheme();
  const layout = useWindowLayout();
  const font = useFont();
  const notice = useNotice();
  const forgetEditing = useCallback(() => {
    setEditing(null);
  }, []);
  const { state, failure, dismissFailure, busy, against, choose } = useVault(remembered.summary, notice, forgetEditing);
  const sidebar = useSidebar();
  const panes = useRef<HTMLDivElement | null>(null);
  const sidebarSizing = useSidebarWidth(panes);
  const searching = useSearchWindow(state.kind === "open");
  const errorPanel = useErrorPanel(state.kind === "open");
  const root = rootOf(state);
  useResumeLecture(root, lecturesOf(state), reading.lecture?.lecture.directory ?? null, reading.open);
  // Only searched while the window asking is open, so nothing runs for a closed window.
  const finding = useFinding(root, lecturesOf(state), searching.open ? query : "", reading);
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
  }, []);


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
  // The highlights library and Settings: at the sidebar's foot, or in the rail when it is hidden.
  const foot = {
    libraryShown: finding.library,
    onToggleLibrary: finding.toggleLibrary,
    onShowErrors: errorPanel.show,
    theme: appearance.theme,
    onChooseTheme: appearance.choose,
    font: font.font,
    onChooseFont: font.choose,
    layout: layout.layout,
    onChooseLayout: layout.choose,
  };


  return (
    <div className="app">
      <WindowBar onSearch={searching.show} onToggleSidebar={sidebar.toggle} sidebarShown={sidebar.shown} />

      <div className="panes" data-sidebar={sidebar.shown ? "shown" : "hidden"} ref={panes}>
        {sidebar.shown && (
          <Sidebar
            busy={busy || reading.opening}
            folder={showing}
            onEdit={setEditing}
            onFolder={goToFolder}
            onImport={add}
            onChooseVault={choose}
            foot={foot}
            onMake={actions.make}
            onOpen={(lecture) => {
              reading.open(summary.root, lecture);
            }}
            openDirectory={openDirectory}
            root={summary.root}
            rows={sidebarRows(summary, showing, "")}
            skipped={summary.skipped}
            unloadable={summary.unloadable}
            width={sidebarSizing.width}
            onMove={(dragged, into) => {
              const item = summary.lectures.find((lecture) => lecture.directory === dragged.path);

              if (dragged.kind === "folder") {
                actions.relocateFolder(dragged.path, into);
              } else if (item !== undefined) {
                actions.relocate(item, into);
              }
            }}
          />
        )}
        {!sidebar.shown && <SidebarFoot rail root={summary.root} {...foot} />}
        {sidebar.shown && <PaneDivider label="Sidebar width" sizing={sidebarSizing} title="Drag to resize the sidebar" />}

        {finding.library ? (
          <HighlightsLibrary
            lectures={summary.lectures}
            onClose={finding.closeLibrary}
            onOpenAt={finding.goTo}
            returnTo={open?.lecture.title ?? null}
            vault={summary.root}
          />
        ) : open !== null ? (
          <Reading
            arrival={finding.arrival}
            directory={open.lecture.directory}
            document={open.document}
            onClose={reading.close}
            title={open.lecture.title}
            heading={{ title: open.lecture.title, meta: headingMeta(open.lecture.createdAt, open.lecture.tags) }}
            vault={summary.root}
          />
        ) : (
          <main className="pane">
            <div className="pane-head pane-strip" data-tauri-drag-region="" />
            {reading.failure !== null && <Failure error={reading.failure} />}
            {zone.failure !== null && <Failure error={zone.failure} />}

            <EmptyPane
              busy={busy}
              folder={showing === "" ? vaultNameOf(summary.root) : nameOf(showing)}
              onAdd={add}
              onChooseVault={choose}
            />
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

      {searching.open && (
        <WorkspaceSearch
          failure={finding.search.failure}
          found={finding.search.found}
          listing={summary}
          onClose={searching.close}
          onFolder={(path) => {
            if (!sidebar.shown) {
              sidebar.toggle();
            }

            goToFolder(path);
          }}
          onOpen={(lecture) => {
            reading.open(summary.root, lecture);
          }}
          onOpenAt={finding.goTo}
          onQuery={setQuery}
          query={query}
        />
      )}
      {notice.text !== null && <Notice onDismiss={notice.dismiss} text={notice.text} />}
      {/* A change to the vault that could not be made, floating where a confirmation would. */}
      {failure !== null && (
        <div className="failure-float">
          <Failure error={failure} onDismiss={dismissFailure} />
        </div>
      )}
      {zone.dragging && (
        <DropOverlay formats={zone.formats} into={showing === "" ? vaultNameOf(summary.root) : nameOf(showing)} />
      )}
    </div>
  );
}
