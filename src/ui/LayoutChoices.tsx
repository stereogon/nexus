/**
 * Choosing the window's layout, Classic or Islands: a section of the Settings box
 * (2026-11-14). Radio items, each with a small picture of the layout, as the canvas draws
 * them, so the two can be told apart before one is chosen. Choosing applies it at once and
 * leaves the box open, as choosing a theme does.
 */
import type { WindowLayout } from "../ipc/layout";

const CHOICES: readonly { readonly name: WindowLayout; readonly label: string; readonly line: string }[] = [
  { name: "classic", label: "Classic", line: "Panes edge to edge, divided by hairlines." },
  { name: "islands", label: "Islands", line: "Each pane a rounded island on one base." },
];

export function LayoutChoices({
  layout,
  onChoose,
}: {
  readonly layout: WindowLayout;
  readonly onChoose: (layout: WindowLayout) => void;
}) {
  return (
    <div aria-label="Layout" className="layout-choices" role="radiogroup">
      {CHOICES.map(({ name, label, line }) => (
        <button
          aria-checked={name === layout}
          className="layout-choice"
          key={name}
          onClick={() => {
            onChoose(name);
          }}
          role="radio"
          type="button"
        >
          <span aria-hidden="true" className="layout-picture" data-layout={name}>
            <span className="layout-picture-bar" />
            <span className="layout-picture-panes">
              <span />
              <span />
              <span />
            </span>
          </span>
          <span className="layout-label">{label}</span>
          <span className="layout-line">{line}</span>
        </button>
      ))}
    </div>
  );
}
