/**
 * Zooming a document without the buttons (2026-11-09): a trackpad pinch, Ctrl with the
 * scroll wheel, and ⌘+ / ⌘−. The user asked for all three; until now only the − and +
 * buttons zoomed.
 *
 * WebKit reports a trackpad pinch as its own gesture events, with the pinch's scale so far;
 * a Ctrl-wheel is a wheel event with `ctrlKey`. Both are handled, and Ctrl-wheels are
 * ignored while a pinch is under way, so one pinch never zooms twice. ⌘+ and ⌘− move
 * through the buttons' steps; ⌘0, the usual "actual size", is the error panel's here.
 */
import { useEffect, useRef, type RefObject } from "react";

import { useMetaShortcut } from "./useMetaShortcut";
import { pinchFactor, wheelFactor } from "./zoom";

/** A pinch's scale so far, from WebKit's gesture event, which no DOM type describes. */
function pinchScale(event: Event): number | null {
  return "scale" in event && typeof event.scale === "number" && event.scale > 0 ? event.scale : null;
}

export function useZoomGestures(
  bed: RefObject<HTMLElement | null>,
  enabled: boolean,
  zoom: { readonly step: (direction: 1 | -1) => void; readonly scaleTo: (scale: (current: number) => number) => void; readonly scale: number },
): void {
  const { scaleTo } = zoom;
  // The scale as last drawn, where a pinch starts from.
  const drawn = useRef(zoom.scale);
  drawn.current = zoom.scale;

  useEffect(() => {
    const element = bed.current;

    if (!enabled || element === null) {
      return undefined;
    }

    let pinchFrom: number | null = null;
    let pinchStart = 1;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || pinchFrom !== null) {
        return;
      }

      // The page's own zoom, not the window's.
      event.preventDefault();
      scaleTo((current) => current * wheelFactor(event.deltaY));
    };
    const onPinchStart = (event: Event) => {
      event.preventDefault();
      pinchStart = pinchScale(event) ?? 1;
      pinchFrom = drawn.current;
    };
    const onPinch = (event: Event) => {
      const scale = pinchScale(event);

      event.preventDefault();

      if (scale !== null && pinchFrom !== null) {
        const from = pinchFrom;

        scaleTo(() => from * pinchFactor(scale / pinchStart));
      }
    };
    const onPinchEnd = () => {
      pinchFrom = null;
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("gesturestart", onPinchStart);
    element.addEventListener("gesturechange", onPinch);
    element.addEventListener("gestureend", onPinchEnd);

    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("gesturestart", onPinchStart);
      element.removeEventListener("gesturechange", onPinch);
      element.removeEventListener("gestureend", onPinchEnd);
    };
  }, [bed, enabled, scaleTo]);

  // ⌘= is ⌘+ without ⇧, which is where + is on most keyboards.
  useMetaShortcut("=", enabled, () => {
    zoom.step(1);
  });
  useMetaShortcut("+", enabled, () => {
    zoom.step(1);
  }, true);
  useMetaShortcut("-", enabled, () => {
    zoom.step(-1);
  });
}
