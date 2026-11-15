/**
 * The A in the format bar, and the menu it opens (2026-11-15, the "Text colour" artboard of
 * the redesign canvas): Notion's nine colours as text, then behind it, each with Default to
 * take the colour off. The selection's colour shows ringed. `notes/paint.ts` writes them.
 */
import { useState } from "react";

import { COLOURS, paintName, type Colour, type Paint } from "../notes/paint";
import type { MenuAt } from "./menuPlacement";
import { under } from "./PopMenu";
import { useFloating } from "./useFloating";

const NAMES: Readonly<Record<Colour, string>> = {
  gray: "Gray",
  brown: "Brown",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  red: "Red",
};

/** What the selection's colour is called, for the menu's foot. */
function describe(paint: Paint | null): string {
  return paint === null ? "No colour" : `${paint.background ? "Background" : "Text"} · ${NAMES[paint.colour]}`;
}

function Choices({
  background,
  current,
  onPaint,
  onDefault,
}: {
  readonly background: boolean;
  readonly current: Paint | null;
  readonly onPaint: (paint: Paint) => void;
  /** Default here: takes the colour off if it is of this kind, and otherwise only closes. */
  readonly onDefault: () => void;
}) {
  const kind = background ? "background" : "text";
  const isCurrent = (colour: Colour | null) =>
    colour === null ? current === null || current.background !== background : current?.colour === colour && current.background === background;

  return (
    <section aria-label={background ? "Background" : "Text"} role="group">
      <h3 className="paint-menu-title">{background ? "Background" : "Text"}</h3>
      <div className="paint-grid">
        <button
          aria-label={`Default ${kind}`}
          aria-pressed={isCurrent(null)}
          className="paint-pick"
          onClick={onDefault}
          title="Default"
          type="button"
        >
          A
        </button>
        {COLOURS.map((colour) => {
          const paint = { colour, background };

          return (
            <button
              aria-label={`${NAMES[colour]} ${kind}`}
              aria-pressed={isCurrent(colour)}
              className="paint-pick"
              data-paint={paintName(paint)}
              key={colour}
              onClick={() => {
                onPaint(paint);
              }}
              title={NAMES[colour]}
              type="button"
            >
              A
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The menu, kept inside the window wherever the bar is, and closed by Escape. */
function PaintMenu({
  at,
  current,
  onChoose,
  onDefault,
  onDismiss,
}: {
  readonly at: MenuAt;
  readonly current: Paint | null;
  readonly onChoose: (paint: Paint) => void;
  readonly onDefault: (background: boolean) => void;
  readonly onDismiss: () => void;
}) {
  const { box, placed } = useFloating(at, onDismiss);

  return (
    <div aria-label="Colour" className="paint-menu" ref={box} role="dialog" style={{ left: placed.left, top: placed.top }}>
      <Choices
        background={false}
        current={current}
        onDefault={() => {
          onDefault(false);
        }}
        onPaint={onChoose}
      />
      <Choices
        background
        current={current}
        onDefault={() => {
          onDefault(true);
        }}
        onPaint={onChoose}
      />
      <p className="paint-menu-foot">
        <span>{describe(current)}</span>
        <span>Default takes it off</span>
      </p>
    </div>
  );
}

/** The menu's width, for placing it before it is drawn; `paint.css` sets the same. */
const MENU_WIDTH = 252;

/** The A, and its menu while open. Choosing closes it. */
export function PaintControl({
  current,
  disabled,
  onPaint,
}: {
  /** The colour the selection is in. */
  readonly current: Paint | null;
  /** No words selected and none coloured to change, or in a table cell. */
  readonly disabled: boolean;
  readonly onPaint: (paint: Paint | null) => void;
}) {
  const [at, setAt] = useState<MenuAt | null>(null);
  const close = () => {
    setAt(null);
  };

  return (
    <>
      <button
        aria-expanded={at !== null && !disabled}
        aria-haspopup="dialog"
        aria-label="Colour"
        className="format-button paint-button"
        disabled={disabled}
        onClick={(event) => {
          const control = event.currentTarget;

          setAt((open) => (open === null ? under(control, "left", MENU_WIDTH) : null));
        }}
        title="Text or background colour"
        type="button"
      >
        A
      </button>
      {at !== null && !disabled && (
        <PaintMenu
          at={at}
          current={current}
          onChoose={(paint) => {
            close();
            onPaint(paint);
          }}
          onDefault={(background) => {
            close();

            // Default under the other kind leaves the colour as it is.
            if (current !== null && current.background === background) {
              onPaint(null);
            }
          }}
          onDismiss={close}
        />
      )}
    </>
  );
}
