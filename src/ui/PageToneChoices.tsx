/**
 * The page tone, in Settings (2026-11-14): Printed, Sepia, Dusk or Night, each a swatch of
 * its own paper and text, saying what it costs, since a tone changes photographs and scans
 * with the page.
 */
import { choosePageTone, usePageTone } from "./pageTone";
import { TONES } from "./pageTones";

export function PageToneChoices() {
  const tone = usePageTone();

  return (
    <>
      <div aria-label="Page tone" className="page-tones" role="radiogroup">
        {TONES.map(({ name, label, line }) => (
          <button
            aria-checked={name === tone}
            className="page-tone"
            data-tone={name}
            key={name}
            onClick={() => {
              choosePageTone(name);
            }}
            role="radio"
            title={line}
            type="button"
          >
            <span aria-hidden="true" className="page-tone-paper">
              <span />
              <span />
              <span />
            </span>
            <span className="page-tone-label">{label}</span>
          </button>
        ))}
      </div>
      <p className="page-tone-hint">
        For every document, in every theme. Photos and scans change with the page; the moon in a document’s bar switches
        tone.
      </p>
    </>
  );
}
