/**
 * The window bar (2026-11-14, from the canvas's Layouts row): a strip across the top of the
 * window, as VS Code has one. The window's own buttons sit at its left, then the control
 * that shows or hides the sidebar, and Search everything (⌘P) in the middle. Both used to be
 * in the sidebar, which left nothing to hold them when it was hidden, and the panes' headers
 * had to make room under the window's buttons.
 *
 * The bar is where the window is dragged from; its controls are not.
 */
import { SearchIcon, SidebarIcon } from "./icons";

export function WindowBar({
  sidebarShown,
  onToggleSidebar,
  onSearch,
}: {
  readonly sidebarShown: boolean;
  readonly onToggleSidebar: () => void;
  readonly onSearch: () => void;
}) {
  const toggle = sidebarShown ? "Hide sidebar" : "Show sidebar";

  return (
    <header className="window-bar" data-tauri-drag-region="">
      <div className="window-bar-lead" data-tauri-drag-region="">
        <button aria-label={toggle} className="chrome-icon" onClick={onToggleSidebar} title={toggle} type="button">
          <SidebarIcon />
        </button>
      </div>
      <button className="search-open window-search" onClick={onSearch} type="button">
        <SearchIcon />
        <span>Search everything</span>
        <span className="kbd">⌘P</span>
      </button>
      <div className="window-bar-trail" data-tauri-drag-region="" />
    </header>
  );
}
