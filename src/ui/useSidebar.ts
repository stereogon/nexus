/**
 * Whether the sidebar is shown, and ⌘P, which goes to its search.
 *
 * ⌘P was printed beside the search box from the start and bound to nothing, which is the
 * app telling the person something untrue (`useMetaShortcut`'s own reason for existing).
 * It shows the sidebar if it was hidden, then puts the cursor in the search, with any
 * earlier query selected so typing replaces it.
 */
import { useCallback, useEffect, useState } from "react";

import { useMetaShortcut } from "./useMetaShortcut";

/** The search box's id: the `<label>` names it, and ⌘P finds it. */
export const SEARCH_ID = "vault-search";

export function useSidebar(enabled: boolean): {
  readonly shown: boolean;
  readonly toggle: () => void;
} {
  const [shown, setShown] = useState(true);
  // Counts presses, so the effect below runs for each — including one while it is focused.
  const [asked, setAsked] = useState(0);

  const toggle = useCallback(() => {
    setShown((current) => !current);
  }, []);

  const find = useCallback(() => {
    setShown(true);
    setAsked((count) => count + 1);
  }, []);

  // After the render that shows the sidebar, so the box exists to be focused.
  useEffect(() => {
    if (asked === 0) {
      return;
    }

    const search = document.getElementById(SEARCH_ID);

    if (search instanceof HTMLInputElement) {
      search.focus();
      search.select();
    }
  }, [asked]);

  useMetaShortcut("p", enabled, find);

  return { shown, toggle };
}
