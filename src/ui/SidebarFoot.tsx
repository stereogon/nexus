/**
 * The foot of the sidebar: the highlights library, the error panel and the theme picker,
 * which lived in the title bar until the redesign (2026-11-07), and the vault's path.
 */
import { useState } from "react";

import { ErrorsIcon, HighlightsIcon, ThemeIcon } from "./icons";
import type { MenuAt } from "./menuPlacement";
import { shortPath } from "./path";
import { ThemePicker } from "./ThemePicker";
import type { ThemeName } from "./themes";

export function SidebarFoot({
  root,
  libraryShown,
  onToggleLibrary,
  errorsShown,
  onToggleErrors,
  theme,
  onChooseTheme,
}: {
  readonly root: string;
  readonly libraryShown: boolean;
  readonly onToggleLibrary: () => void;
  readonly errorsShown: boolean;
  readonly onToggleErrors: () => void;
  readonly theme: ThemeName;
  readonly onChooseTheme: (theme: ThemeName) => void;
}) {
  const [picking, setPicking] = useState<MenuAt | null>(null);

  return (
    <div className="sidebar-foot">
      <button
        aria-label="Highlights library"
        aria-pressed={libraryShown}
        className="chrome-icon"
        onClick={onToggleLibrary}
        title="All highlights"
        type="button"
      >
        <HighlightsIcon />
      </button>
      <button
        aria-label="Errors"
        aria-pressed={errorsShown}
        className="chrome-icon"
        onClick={onToggleErrors}
        title="Errors (⌘0)"
        type="button"
      >
        <ErrorsIcon />
      </button>
      <button
        aria-expanded={picking !== null}
        aria-haspopup="menu"
        aria-label="Theme"
        className="chrome-icon"
        data-opens="theme"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();

          // Opens upward from the foot, where there is room.
          setPicking((open) => (open === null ? { left: box.left, top: box.bottom + 6, above: box.top - 6 } : null));
        }}
        title="Theme"
        type="button"
      >
        <ThemeIcon />
      </button>
      <span className="sidebar-path" title={root}>
        {shortPath(root)}
      </span>
      {picking !== null && (
        <ThemePicker
          at={picking}
          onChoose={onChooseTheme}
          onDismiss={() => {
            setPicking(null);
          }}
          theme={theme}
        />
      )}
    </div>
  );
}
