/**
 * ⌘Z and ⌘⇧Z for what is marked on the document.
 *
 * Not through `useMetaShortcut`, for two reasons. That hook ignores Shift, so it cannot
 * tell undo from redo. And this one must step aside whenever focus is somewhere text is
 * typed — the notes, a sticky note, the page field, the search box — where ⌘Z already
 * means "undo my typing". Checking only whether the event was handled is not enough there:
 * a plain field — the search box, the page field — undoes natively and leaves the keydown
 * unhandled, and that keystroke must not reach across and remove a highlight someone made
 * an hour ago. (The notes editor does mark ⌘Z handled, even with its history empty — seen
 * when this check was removed and the notes journey still passed; the field journey is
 * the one that fails without it.)
 */
import { useEffect } from "react";

/** Whether focus is somewhere ⌘Z belongs to the text being typed. */
export function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']") !== null)
  );
}

export function useUndoKeys(undo: () => void, redo: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== "z") {
        return;
      }

      if (event.defaultPrevented || typingIn(event.target)) {
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [undo, redo]);
}
