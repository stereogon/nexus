/**
 * Choosing one of the fifteen themes, or following macOS.
 *
 * A menu of radio items, each with three swatches — the theme's ground, its text and its
 * accent — so a theme can be recognised before it is chosen. Choosing applies it at once
 * and leaves the menu open, so themes can be tried one after another; Escape or a click
 * elsewhere closes it. From the redesign canvas's themes board (2026-11-07).
 */
import type { MenuAt } from "./menuPlacement";
import { PALETTE_ORDER, THEMES, type PaletteName, type ThemeName } from "./themes";
import { useFloating } from "./useFloating";
import { useDismissOutside } from "./usePopover";

function Swatches({ name }: { readonly name: PaletteName }) {
  const { palette } = THEMES[name];

  return (
    <span aria-hidden="true" className="theme-swatches">
      {[palette.chrome, palette.text, palette.accent].map((colour, index) => (
        <span className="theme-swatch" key={index} style={{ background: colour }} />
      ))}
    </span>
  );
}

function Choice({
  name,
  label,
  mood,
  chosen,
  onChoose,
  swatches,
}: {
  readonly name: ThemeName;
  readonly label: string;
  readonly mood: string;
  readonly chosen: boolean;
  readonly onChoose: (theme: ThemeName) => void;
  readonly swatches: PaletteName | null;
}) {
  return (
    <button
      aria-checked={chosen}
      className="theme-choice"
      onClick={() => {
        onChoose(name);
      }}
      role="menuitemradio"
      title={mood}
      type="button"
    >
      {swatches === null ? (
        <span aria-hidden="true" className="theme-swatches theme-system">
          <Swatches name="paper" />
          <Swatches name="ink" />
        </span>
      ) : (
        <Swatches name={swatches} />
      )}
      <span className="theme-label">{label}</span>
      {chosen && (
        <svg aria-hidden="true" className="theme-check" height="12" viewBox="0 0 12 12" width="12">
          <path d="M2.5 6.2 L5 8.6 L9.5 3.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        </svg>
      )}
    </button>
  );
}

export function ThemePicker({
  at,
  theme,
  onChoose,
  onDismiss,
}: {
  readonly at: MenuAt;
  readonly theme: ThemeName;
  readonly onChoose: (theme: ThemeName) => void;
  readonly onDismiss: () => void;
}) {
  const { box, placed } = useFloating(at, onDismiss);

  useDismissOutside(box, "theme", onDismiss);

  return (
    <div aria-label="Theme" className="theme-picker" ref={box} role="menu" style={{ left: placed.left, top: placed.top }}>
      <Choice
        chosen={theme === "system"}
        label="Follow macOS"
        mood="Paper in light mode, Ink in dark."
        name="system"
        onChoose={onChoose}
        swatches={null}
      />
      <div aria-hidden="true" className="theme-divider" />
      <div className="theme-grid">
        {PALETTE_ORDER.map((name) => (
          <Choice
            chosen={theme === name}
            key={name}
            label={THEMES[name].label}
            mood={THEMES[name].mood}
            name={name}
            onChoose={onChoose}
            swatches={name}
          />
        ))}
      </div>
    </div>
  );
}
