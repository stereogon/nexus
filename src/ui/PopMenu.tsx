/**
 * A small floating menu: the sidebar's "+" and the vault switcher.
 *
 * Real `menuitem` buttons, so Tab and screen readers find them; Escape and a click
 * elsewhere close it, and choosing an item closes it too.
 */
import type { ReactNode } from "react";

import type { MenuAt } from "./menuPlacement";
import { useFloating } from "./useFloating";
import { useDismissOutside } from "./usePopover";

/** A shortcut as shown, "⇧⌘N", as `aria-keyshortcuts` writes it, "Shift+Meta+N". */
function spokenKeys(keys: string): string {
  const parts = [keys.includes("⇧") ? "Shift" : "", keys.includes("⌘") ? "Meta" : "", keys.replace(/[⇧⌘]/gu, "")];

  return parts.filter((part) => part !== "").join("+");
}

export interface MenuItem {
  readonly label: string;
  readonly icon?: ReactNode;
  /** A shortcut that really does this, shown at the end. */
  readonly keys?: string;
  readonly onSelect: () => void;
}

export function PopMenu({
  label,
  opener,
  at,
  items,
  note,
  onDismiss,
}: {
  readonly label: string;
  /** The `data-opens` name of the control that toggles it. */
  readonly opener: string;
  readonly at: MenuAt;
  readonly items: readonly MenuItem[];
  /** A line under the items, saying where they act. */
  readonly note?: string;
  readonly onDismiss: () => void;
}) {
  const { box, placed } = useFloating(at, onDismiss);

  useDismissOutside(box, opener, onDismiss);

  return (
    <div aria-label={label} className="pop-menu" ref={box} role="menu" style={{ left: placed.left, top: placed.top }}>
      {items.map((item) => (
        <button
          // The shortcut is shown, and announced as one, but is not part of the item's name.
          aria-keyshortcuts={item.keys === undefined ? undefined : spokenKeys(item.keys)}
          className="pop-item"
          key={item.label}
          onClick={() => {
            onDismiss();
            item.onSelect();
          }}
          role="menuitem"
          type="button"
        >
          {item.icon}
          <span className="pop-label">{item.label}</span>
          {item.keys !== undefined && (
            <span aria-hidden="true" className="pop-keys">
              {item.keys}
            </span>
          )}
        </button>
      ))}
      {note !== undefined && <p className="pop-note">{note}</p>}
    </div>
  );
}

/** Where a menu opens under the control that was clicked, right edges lined up or left. */
export function under(control: HTMLElement, align: "left" | "right", width: number): MenuAt {
  const box = control.getBoundingClientRect();

  return { left: align === "left" ? box.left : box.right - width, top: box.bottom + 6, above: box.top - 6 };
}
