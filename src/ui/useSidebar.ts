/**
 * Whether the sidebar is shown. (⌘P, which used to put the cursor in the sidebar's search,
 * opens the search window now: `useSearchWindow`.)
 */
import { useCallback, useState } from "react";

export function useSidebar(): {
  readonly shown: boolean;
  readonly toggle: () => void;
} {
  const [shown, setShown] = useState(true);

  const toggle = useCallback(() => {
    setShown((current) => !current);
  }, []);

  return { shown, toggle };
}
