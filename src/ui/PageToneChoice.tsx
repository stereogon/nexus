/**
 * Dark pages, in Settings (2026-11-14): one switch, saying what it costs, since inverting a
 * page inverts its photographs and scans as well.
 */
import { choosePageTone, usePageTone } from "./pageTone";

export function PageToneChoice() {
  const dark = usePageTone() === "dark";

  return (
    <button
      aria-checked={dark}
      className="page-tone-choice"
      onClick={() => {
        choosePageTone(dark ? "printed" : "dark");
      }}
      role="switch"
      type="button"
    >
      <span className="page-tone-words">
        <span className="page-tone-label">Dark pages in dark themes</span>
        <span className="page-tone-line">
          Pages are inverted to sit with the theme. Photos, diagrams and scans invert too; the moon in a document’s bar
          puts it back.
        </span>
      </span>
      <span aria-hidden="true" className="switch" />
    </button>
  );
}
