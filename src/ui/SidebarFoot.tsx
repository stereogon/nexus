/**
 * The foot of the sidebar: the highlights library, which is something read, and Settings,
 * which holds the things set rarely — the theme, the error panel, the vault (2026-11-07,
 * at the user's request: one settings control rather than an icon each).
 *
 * With the sidebar hidden, the same two controls stand in a narrow rail down the window's
 * left edge (`rail`, 2026-11-14, at the user's request), so neither goes away with it.
 */
import { useState, useSyncExternalStore } from "react";

import { onErrorsChanged, shownErrors } from "./errorLog";
import { GearIcon, HighlightsIcon } from "./icons";
import type { MenuAt } from "./menuPlacement";
import { shortPath } from "./path";
import { SettingsBox } from "./SettingsBox";
import type { ThemeName } from "./themes";

export function SidebarFoot({
  root,
  libraryShown,
  onToggleLibrary,
  onShowErrors,
  theme,
  onChooseTheme,
  rail = false,
}: {
  readonly root: string;
  /** Drawn as the rail beside a hidden sidebar: the two controls alone, one above the other. */
  readonly rail?: boolean;
  readonly libraryShown: boolean;
  readonly onToggleLibrary: () => void;
  readonly onShowErrors: () => void;
  readonly theme: ThemeName;
  readonly onChooseTheme: (theme: ThemeName) => void;
}) {
  const [settings, setSettings] = useState<MenuAt | null>(null);
  const errors = useSyncExternalStore(onErrorsChanged, shownErrors).length;

  return (
    <div className={rail ? "sidebar-rail" : "sidebar-foot"}>
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
        aria-expanded={settings !== null}
        aria-haspopup="dialog"
        aria-label={errors === 0 ? "Settings" : `Settings, ${String(errors)} ${errors === 1 ? "error" : "errors"} since launch`}
        className="chrome-icon settings-control"
        data-opens="settings"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();

          // Opens upward from the foot, where there is room (`placeMenu` flips it).
          setSettings((open) => (open === null ? { left: box.left, top: box.bottom + 6, above: box.top - 6 } : null));
        }}
        title="Settings"
        type="button"
      >
        <GearIcon />
        {errors > 0 && <span aria-hidden="true" className="settings-badge" />}
      </button>
      {!rail && (
        <span className="sidebar-path" title={root}>
          {shortPath(root)}
        </span>
      )}
      {settings !== null && (
        <SettingsBox
          at={settings}
          errors={errors}
          onChooseTheme={onChooseTheme}
          onDismiss={() => {
            setSettings(null);
          }}
          onShowErrors={onShowErrors}
          root={root}
          theme={theme}
        />
      )}
    </div>
  );
}
