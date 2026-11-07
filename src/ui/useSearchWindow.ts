/**
 * Whether the ⌘P search window is open.
 *
 * ⌘P was printed beside the search from the start and is the shortcut `claude-spec.md`
 * names; it opens the window from anywhere in the workspace, including while typing in the
 * notes, since a shortcut that only works with the focus in the right place is one nobody
 * can rely on.
 */
import { useCallback, useState } from "react";

import { useMetaShortcut } from "./useMetaShortcut";

export function useSearchWindow(enabled: boolean): {
  readonly open: boolean;
  readonly show: () => void;
  readonly close: () => void;
} {
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useMetaShortcut("p", enabled, show);

  return { open: open && enabled, show, close };
}
