/**
 * Whether the error panel is open, and ⌘0, which opens and closes it.
 *
 * ⌘0 at the user's request (2026-11-05), in place of the spec's ⌘⇧D. In most Mac viewers
 * ⌘0 is "actual size"; Nexus has no actual-size zoom, so nothing is displaced.
 */
import { useCallback, useState } from "react";

import { useMetaShortcut } from "./useMetaShortcut";

export function useErrorPanel(enabled: boolean): {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly show: () => void;
  readonly close: () => void;
} {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  const show = useCallback(() => {
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useMetaShortcut("0", enabled, toggle);

  return { open: open && enabled, toggle, show, close };
}
