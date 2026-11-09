/**
 * Dragging items and folders in the sidebar onto another folder, or up the folder path
 * above the list, to move them there (2026-11-09).
 *
 * Followed by the pointer rather than by the browser's drag and drop, as the notes' ⋮⋮
 * handle is: the window's own file-drop handling sits over the browser's, and a press that
 * barely moves must still be a click that opens the row. A row says it can be dragged with
 * `data-drag` (`item` or `folder`) and `data-path`; anything it can be dropped on says so
 * with `data-drop`, the folder's path (`""` for the top of the vault).
 */
import { useEffect, useState, type RefObject } from "react";

import { parentOf } from "./folders";

export interface Dragged {
  readonly kind: "item" | "folder";
  readonly path: string;
}

/** How far a press moves before it is a drag, not a click. */
const DRAG_AFTER = 5;

/** Whether `dragged` can go into `into`: not where it is, and a folder not inside itself. */
export function canDrop(dragged: Dragged, into: string): boolean {
  if (into === parentOf(dragged.path)) {
    return false;
  }

  return dragged.kind === "item" || (into !== dragged.path && !into.startsWith(`${dragged.path}/`));
}

export function useSidebarDrag(
  box: RefObject<HTMLElement | null>,
  onDrop: (dragged: Dragged, into: string) => void,
): { readonly label: string; readonly x: number; readonly y: number } | null {
  const [ghost, setGhost] = useState<{ readonly label: string; readonly x: number; readonly y: number } | null>(null);

  useEffect(() => {
    const element = box.current;

    if (element === null) {
      return undefined;
    }

    const onDown = (down: PointerEvent) => {
      const row = down.target instanceof Element ? down.target.closest<HTMLElement>("[data-drag]") : null;
      const kind = row?.dataset.drag;
      const path = row?.dataset.path;

      if (down.button !== 0 || row === null || path === undefined || (kind !== "item" && kind !== "folder")) {
        return;
      }

      const dragged: Dragged = { kind, path };
      const label = row.querySelector(".row-title")?.textContent ?? path;
      let dragging = false;
      let target: HTMLElement | null = null;

      const mark = (next: HTMLElement | null) => {
        target?.removeAttribute("data-drop-active");
        target = next;
        target?.setAttribute("data-drop-active", "");
      };
      const onMove = (move: PointerEvent) => {
        if (!dragging && Math.hypot(move.clientX - down.clientX, move.clientY - down.clientY) < DRAG_AFTER) {
          return;
        }

        dragging = true;
        setGhost({ label, x: move.clientX, y: move.clientY });

        const under = document.elementFromPoint(move.clientX, move.clientY)?.closest<HTMLElement>("[data-drop]") ?? null;
        const into = under?.dataset.drop;

        mark(under !== null && element.contains(under) && into !== undefined && canDrop(dragged, into) ? under : null);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);

        if (!dragging) {
          return;
        }

        // The click a drag ends with would otherwise open the row it started on. A browser
        // sends it straight after this release, or not at all when the press and the release
        // fell on different elements, so the guard lasts only until this input is handled;
        // left waiting, it would swallow the next real click instead (found by the journey).
        const swallow = (click: MouseEvent) => {
          click.preventDefault();
          click.stopPropagation();
        };

        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => {
          window.removeEventListener("click", swallow, { capture: true });
        }, 0);

        const into = target?.dataset.drop;

        mark(null);
        setGhost(null);

        if (into !== undefined) {
          onDrop(dragged, into);
        }
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    };

    element.addEventListener("pointerdown", onDown);

    return () => {
      element.removeEventListener("pointerdown", onDown);
    };
  }, [box, onDrop]);

  return ghost;
}
