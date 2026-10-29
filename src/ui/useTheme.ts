/**
 * Applying and remembering the theme.
 *
 * The stylesheet carries three cases: a `prefers-color-scheme` media query for `system`,
 * and `:root[data-theme="light"|"dark"]` for a pinned choice. This hook's whole job is to
 * set that attribute and write the choice down.
 */
import { useCallback, useEffect, useState } from "react";

import { lastTheme, rememberTheme, type Theme } from "../ipc/theme";

/** The order the title-bar control cycles through. */
const ORDER: readonly Theme[] = ["system", "light", "dark"];

/** What the control should say it will do next. */
export const THEME_LABEL: Record<Theme, string> = {
  system: "Theme: following the system",
  light: "Theme: light",
  dark: "Theme: dark",
};

export function useTheme(): {
  readonly theme: Theme;
  readonly cycle: () => void;
} {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const session = { cancelled: false };

    void (async () => {
      const recorded = await lastTheme();

      if (!session.cancelled) {
        setTheme(recorded);
      }
    })();

    return () => {
      session.cancelled = true;
    };
  }, []);

  // "Follow the system" is resolved here rather than in the stylesheet, and a concrete
  // `data-theme` is always written. That lets the dark palette be declared once; the
  // alternative -- a `prefers-color-scheme` query for the system case plus a rule for a
  // pinned one -- means two copies of every token, and the first to be forgotten is a bug
  // nobody notices until they switch themes.
  useEffect(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const resolved = theme === "system" ? (dark.matches ? "dark" : "light") : theme;

      document.documentElement.setAttribute("data-theme", resolved);
    };

    apply();

    // Only while following the system does its preference still matter -- someone who has
    // pinned a theme should not have it change under them at sunset.
    if (theme !== "system") {
      return undefined;
    }

    dark.addEventListener("change", apply);

    return () => {
      dark.removeEventListener("change", apply);
    };
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((current) => {
      const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? "system";

      // Applied immediately and recorded in the background: the window has already
      // changed, and waiting on a file write to repaint would be backwards.
      void rememberTheme(next);

      return next;
    });
  }, []);

  return { theme, cycle };
}
