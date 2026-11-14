/**
 * Settings: the theme, the font, the page tone and the window's layout (2026-11-14), the error panel and the vault,
 * behind one control at the foot of the sidebar.
 *
 * Asked for on 2026-11-07: *"it is not always required that you put icons together and
 * visible … we can have a settings icon, and that can open a box to select these things,
 * like we have in vs code"*. So the theme and errors controls, which are visited rarely,
 * live here instead of each taking a place in the sidebar. The count of errors since launch
 * is shown on the Settings control itself, so a problem is not hidden by the icon going.
 *
 * A dialog rather than a menu, because it holds a radio group and buttons rather than a
 * list of commands. Escape or a click elsewhere closes it.
 */
import type { Font } from "../ipc/font";
import type { WindowLayout } from "../ipc/layout";
import { FontChoices } from "./FontChoices";
import { LayoutChoices } from "./LayoutChoices";
import type { MenuAt } from "./menuPlacement";
import { PageToneChoices } from "./PageToneChoices";
import { ThemeChoices } from "./ThemeChoices";
import type { ThemeName } from "./themes";
import { useFloating } from "./useFloating";
import { useDismissOutside } from "./usePopover";

export function SettingsBox({
  at,
  root,
  theme,
  onChooseTheme,
  font,
  onChooseFont,
  layout,
  onChooseLayout,
  errors,
  onShowErrors,
  onDismiss,
}: {
  readonly at: MenuAt;
  readonly root: string;
  readonly theme: ThemeName;
  readonly onChooseTheme: (theme: ThemeName) => void;
  readonly font: Font;
  readonly onChooseFont: (font: Font) => void;
  readonly layout: WindowLayout;
  readonly onChooseLayout: (layout: WindowLayout) => void;
  /** How many errors have been shown since launch. */
  readonly errors: number;
  readonly onShowErrors: () => void;
  readonly onDismiss: () => void;
}) {
  const { box, placed } = useFloating(at, onDismiss);

  useDismissOutside(box, "settings", onDismiss);

  return (
    <div
      aria-labelledby="settings-heading"
      className="settings-box"
      ref={box}
      role="dialog"
      style={{ left: placed.left, top: placed.top }}
    >
      <h2 className="settings-heading" id="settings-heading">
        Settings
      </h2>

      <section aria-labelledby="settings-theme" className="settings-section">
        <h3 className="settings-title" id="settings-theme">
          Theme
        </h3>
        <ThemeChoices onChoose={onChooseTheme} theme={theme} />
      </section>

      <section aria-labelledby="settings-font" className="settings-section">
        <h3 className="settings-title" id="settings-font">
          Font
        </h3>
        <FontChoices font={font} onChoose={onChooseFont} />
      </section>

      <section aria-labelledby="settings-page-tone" className="settings-section">
        <h3 className="settings-title" id="settings-page-tone">
          Page tone
        </h3>
        <PageToneChoices />
      </section>

      <section aria-labelledby="settings-layout" className="settings-section">
        <h3 className="settings-title" id="settings-layout">
          Layout
        </h3>
        <LayoutChoices layout={layout} onChoose={onChooseLayout} />
      </section>

      <section aria-labelledby="settings-diagnostics" className="settings-section">
        <h3 className="settings-title" id="settings-diagnostics">
          Diagnostics
        </h3>
        <button
          className="settings-row"
          onClick={() => {
            onDismiss();
            onShowErrors();
          }}
          type="button"
        >
          <span className="settings-row-label">Errors since launch</span>
          <span className={errors === 0 ? "settings-count" : "settings-count some"}>{String(errors)}</span>
          <span className="settings-keys">⌘0</span>
        </button>
      </section>

      <section aria-labelledby="settings-vault" className="settings-section">
        <h3 className="settings-title" id="settings-vault">
          Vault
        </h3>
        <p className="settings-path" title={root}>
          {root}
        </p>
        <p className="settings-hint">Switch vaults from the vault’s name at the top of the sidebar.</p>
      </section>
    </div>
  );
}
