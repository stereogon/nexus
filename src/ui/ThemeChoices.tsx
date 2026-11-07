/**
 * Choosing one of the fifteen themes, or following macOS: a section of the Settings box.
 *
 * Radio items, each with three swatches — the theme's ground, its text and its accent — so
 * a theme can be recognised before it is chosen. Choosing applies it at once and leaves the
 * box open, so themes can be tried one after another. From the redesign canvas's themes
 * board (2026-11-07).
 */
import { PALETTE_ORDER, THEMES, type PaletteName, type ThemeName } from "./themes";

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
      role="radio"
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

/** The sixteen choices, as a group of radio items: a section of the Settings box. */
export function ThemeChoices({
  theme,
  onChoose,
}: {
  readonly theme: ThemeName;
  readonly onChoose: (theme: ThemeName) => void;
}) {
  return (
    <div aria-label="Theme" className="theme-choices" role="radiogroup">
      <Choice
        chosen={theme === "system"}
        label="Follow macOS"
        mood="Paper in light mode, Ink in dark."
        name="system"
        onChoose={onChoose}
        swatches={null}
      />
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
