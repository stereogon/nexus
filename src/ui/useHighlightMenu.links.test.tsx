// @vitest-environment jsdom
/**
 * The menu for a box drawn with Option held, and "Link to notes" from any menu.
 *
 * Split from `useHighlightMenu.test.tsx` on 2026-11-05 when Link to notes took it past the
 * 300-line limit; these are the two sources that store something before citing it.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Annotation } from "../ipc/annotations";
import { AT, HIGHLIGHT, annotations } from "./useHighlightMenu.fixtures";
import { useHighlightMenu } from "./useHighlightMenu";

describe("a box drawn with Option held", () => {
  const REGION = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };

  it("opens a menu of meanings, with nothing pressed and nothing to remove", () => {
    const { result } = renderHook(() => useHighlightMenu(annotations(), vi.fn()));

    act(() => {
      result.current.draw(3, REGION, AT);
    });

    expect(result.current.open?.at).toEqual(AT);
    expect(result.current.open?.current).toBeNull();
    expect(result.current.open?.onRemove).toBeNull();
  });

  it("stores the box on its page with the meaning chosen, and closes", () => {
    const held = annotations();
    const { result } = renderHook(() => useHighlightMenu(held, vi.fn()));

    act(() => {
      result.current.draw(3, REGION, AT);
    });
    act(() => {
      result.current.open?.onChoose?.("definition");
    });

    expect(held.addArea).toHaveBeenCalledWith(3, REGION, "definition");
    expect(result.current.open).toBeNull();
    expect(result.current.drawn).toBeNull();
  });

  it("is kept for the viewer to outline until a meaning is chosen", () => {
    const { result } = renderHook(() => useHighlightMenu(annotations(), vi.fn()));

    act(() => {
      result.current.draw(3, REGION, AT);
    });

    expect(result.current.drawn).toEqual({ pageIndex: 3, region: REGION, at: AT });
  });

  it("is forgotten when dismissed, as when the page moves under it", () => {
    const { result } = renderHook(() => useHighlightMenu(annotations(), vi.fn()));

    act(() => {
      result.current.draw(3, REGION, AT);
    });
    act(() => {
      result.current.dismiss();
    });

    expect(result.current.open).toBeNull();
    expect(result.current.drawn).toBeNull();
  });

  it("gives way to a badge that is clicked while it waits", () => {
    // Clicking a badge is the more recent deliberate act.
    const { result } = renderHook(() => useHighlightMenu(annotations(), vi.fn()));

    act(() => {
      result.current.draw(3, REGION, AT);
    });
    act(() => {
      result.current.pick(HIGHLIGHT, { left: 500, top: 600, above: 580 });
    });

    expect(result.current.open?.current).toBe("key");
  });

  it("keeps the same draw function across renders", () => {
    // The drag hook depends on it, so a new one each render would rebuild the handler on
    // every mouse move.
    const { result, rerender } = renderHook(() => useHighlightMenu(annotations(), vi.fn()));
    const first = result.current.draw;

    rerender();

    expect(result.current.draw).toBe(first);
  });
});

describe("Link to notes", () => {
  it("cites a picked highlight as it is, and closes", () => {
    const link = vi.fn();
    const { result } = renderHook(() => useHighlightMenu(annotations(), link));

    act(() => {
      result.current.pick(HIGHLIGHT, AT);
    });
    act(() => {
      result.current.open?.onLink();
    });

    expect(link).toHaveBeenCalledWith(HIGHLIGHT);
    expect(result.current.open).toBeNull();
  });

  it("stores a drawn box first, as a key concept, then cites what was stored", async () => {
    // A citation needs an id, and only the stored annotation has one.
    const held = annotations();
    const stored: Annotation = {
      kind: "areaHighlight",
      id: "ar-1",
      page: 4,
      semantic: "key",
      region: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
      createdAt: "2026-11-05T10:00:00Z",
      updatedAt: "2026-11-05T10:00:00Z",
    };
    const addArea = vi.fn(() => Promise.resolve(stored));
    const link = vi.fn();
    const { result } = renderHook(() => useHighlightMenu({ ...held, addArea }, link));

    act(() => {
      result.current.draw(3, stored.region, AT);
    });
    await act(async () => {
      result.current.open?.onLink();
      await Promise.resolve();
    });

    expect(addArea).toHaveBeenCalledWith(3, stored.region, "key");
    expect(link).toHaveBeenCalledWith(stored);
  });

  it("cites nothing when storing the box failed", async () => {
    // The failure is shown by the annotations hook; a citation to nothing would be worse.
    const held = annotations();
    const link = vi.fn();
    const { result } = renderHook(() => useHighlightMenu(held, link));

    act(() => {
      result.current.draw(3, { x: 0.1, y: 0.2, width: 0.4, height: 0.3 }, AT);
    });
    await act(async () => {
      result.current.open?.onLink();
      await Promise.resolve();
    });

    expect(link).not.toHaveBeenCalled();
  });
});
