/**
 * The content size of an element, kept current as it changes.
 *
 * Moved out of `PdfViewer` on 2026-11-05. Measured rather than assumed, because fit-width
 * is a function of the pane's width, and the pane narrows whenever the notes or the editor
 * panel open beside it.
 */
import { useEffect, useState, type RefObject } from "react";

export function useElementSize(element: RefObject<HTMLElement | null>): {
  readonly width: number;
  readonly height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const observed = element.current;

    if (observed === null) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });

    observer.observe(observed);

    return () => {
      observer.disconnect();
    };
  }, [element]);

  return size;
}
