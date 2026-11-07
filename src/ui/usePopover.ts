/**
 * Closing a floating menu on a click anywhere else.
 *
 * Shared by the theme picker and the sidebar's menus. Escape is `useFloating`'s; this adds
 * the pointer, ignoring the control that opened the menu (marked `data-opens="<name>"`),
 * which toggles the menu itself and would otherwise close it here and reopen it a moment
 * later.
 */
import { useEffect, type RefObject } from "react";

export function useDismissOutside(box: RefObject<HTMLElement | null>, opener: string, onDismiss: () => void): void {
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element) || box.current?.contains(target) === true) {
        return;
      }

      if (target.closest(`[data-opens="${opener}"]`) === null) {
        onDismiss();
      }
    };

    document.addEventListener("pointerdown", onPointer);

    return () => {
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [box, opener, onDismiss]);
}
