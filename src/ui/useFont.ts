/**
 * Applying and remembering the window's font (2026-11-14). Written onto the document as
 * `data-font`, which `typefaces.css` keys on, as `useWindowLayout` writes the layout.
 */
import { useCallback, useEffect, useState } from "react";

import { lastFont, rememberFont, type Font } from "../ipc/font";

export function useFont(): {
  readonly font: Font;
  readonly choose: (font: Font) => void;
} {
  const [font, setFont] = useState<Font>("theme");

  useEffect(() => {
    const session = { cancelled: false };

    void (async () => {
      const recorded = await lastFont();

      if (!session.cancelled) {
        setFont(recorded);
      }
    })();

    return () => {
      session.cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-font", font);
  }, [font]);

  const choose = useCallback((next: Font) => {
    // Applied at once and recorded in the background, as the theme is.
    setFont(next);
    void rememberFont(next);
  }, []);

  return { font, choose };
}
