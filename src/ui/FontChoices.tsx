/**
 * Choosing the window's font: a section of the Settings box (2026-11-14, at the user's
 * request, after Slack's setting). Each choice is drawn in its own face, so it can be judged
 * before it is chosen, and applies at once, leaving the box open, as a theme does.
 */
import type { Font } from "../ipc/font";

const CHOICES: readonly { readonly name: Font; readonly label: string; readonly line: string }[] = [
  { name: "theme", label: "Theme", line: "The theme’s own: Plex Sans and Literata, or Funky’s Recursive." },
  { name: "readable", label: "Readable", line: "Atkinson Hyperlegible, made to tell every letter apart." },
  { name: "mono", label: "Mono", line: "IBM Plex Mono, every letter the same width." },
];

export function FontChoices({ font, onChoose }: { readonly font: Font; readonly onChoose: (font: Font) => void }) {
  return (
    <div aria-label="Font" className="font-choices" role="radiogroup">
      {CHOICES.map(({ name, label, line }) => (
        <button
          aria-checked={name === font}
          className="font-choice"
          data-font={name}
          key={name}
          onClick={() => {
            onChoose(name);
          }}
          role="radio"
          type="button"
        >
          <span aria-hidden="true" className="font-sample">
            Aa
          </span>
          <span className="font-label">{label}</span>
          <span className="font-line">{line}</span>
        </button>
      ))}
    </div>
  );
}
