/**
 * One ⌘-key shortcut, bound while it is enabled.
 *
 * Exists because the canvas's drop state says "or press ⌘O to browse", and printing that
 * sentence without binding the key would be the app telling the person something untrue.
 */
import { useEffect } from "react";

/**
 * Runs `action` when ⌘ and `key` are pressed together.
 *
 * `enabled` gates the binding rather than the handler, so a disabled shortcut does not
 * swallow the keystroke: with no vault open, ⌘O should reach the webview and do whatever it
 * would normally do, not be quietly eaten.
 *
 * Matches on `event.key`, which is the character the keyboard produced, so the binding
 * follows a non-US layout instead of assuming where `O` sits.
 */
export function useMetaShortcut(
  key: string,
  enabled: boolean,
  action: () => void,
  /** Whether ⇧ is part of the chord: ⌘N and ⇧⌘N are different shortcuts (2026-11-09). */
  shift = false,
): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // `ctrlKey` is excluded rather than ignored: ⌘⌃O is a different chord, and treating
      // it as this one would fire on a shortcut someone meant for something else.
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey !== shift) {
        return;
      }

      // Already handled by whatever has focus — the notes' ⌘B is bold, and the spec gives
      // ⌘B to the sidebar too. The focused editor's meaning wins (2026-11-05).
      if (event.defaultPrevented) {
        return;
      }

      if (event.key.toLowerCase() !== key.toLowerCase()) {
        return;
      }

      // The webview has its own meaning for most ⌘ chords; this one is ours now.
      event.preventDefault();
      action();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [action, enabled, key, shift]);
}
