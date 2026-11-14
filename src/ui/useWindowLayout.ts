/**
 * Applying and remembering the window's layout: Classic, the panes edge to edge, or Islands,
 * each pane a rounded island on one base (2026-11-14). Written onto the document as
 * `data-layout`, which `layouts.css` keys on, as `useTheme` writes the theme.
 */
import { useCallback, useEffect, useState } from "react";

import { lastWindowLayout, rememberWindowLayout, type WindowLayout } from "../ipc/layout";

export function useWindowLayout(): {
  readonly layout: WindowLayout;
  readonly choose: (layout: WindowLayout) => void;
} {
  const [layout, setLayout] = useState<WindowLayout>("classic");

  useEffect(() => {
    const session = { cancelled: false };

    void (async () => {
      const recorded = await lastWindowLayout();

      if (!session.cancelled) {
        setLayout(recorded);
      }
    })();

    return () => {
      session.cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-layout", layout);
  }, [layout]);

  const choose = useCallback((next: WindowLayout) => {
    // Applied at once and recorded in the background, as the theme is.
    setLayout(next);
    void rememberWindowLayout(next);
  }, []);

  return { layout, choose };
}
