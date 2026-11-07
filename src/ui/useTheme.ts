/**
 * Applying and remembering the theme.
 *
 * The palettes are data (`./themes`); this hook resolves "follow the system" to Paper or
 * Ink, writes the chosen palette onto the document, and records the choice. Resolved here
 * rather than in a `prefers-color-scheme` query so there is one place a colour comes from.
 */
import { useCallback, useEffect, useState } from "react";

import { lastTheme, rememberTheme } from "../ipc/theme";
import { applyTheme, resolve, type ThemeName } from "./themes";

export function useTheme(): {
  readonly theme: ThemeName;
  readonly choose: (theme: ThemeName) => void;
} {
  const [theme, setTheme] = useState<ThemeName>("system");

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

  useEffect(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      applyTheme(document.documentElement, resolve(theme, dark.matches));
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

  const choose = useCallback((next: ThemeName) => {
    // Applied immediately and recorded in the background: the window has already changed,
    // and waiting on a file write to repaint would be backwards.
    setTheme(next);
    void rememberTheme(next);
  }, []);

  return { theme, choose };
}
