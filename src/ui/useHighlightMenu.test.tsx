// @vitest-environment jsdom
/**
 * Which menu is open, and the identity that lets the viewer close it.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Annotation } from "../ipc/annotations";
import type { Annotations } from "./useAnnotations";
import { useHighlightMenu } from "./useHighlightMenu";

const AT = { left: 100, top: 200, above: 180 };

const HIGHLIGHT: Annotation = {
  kind: "textHighlight",
  id: "hl-7",
  page: 4,
  semantic: "key",
  quote: "Raft achieves consensus.",
  rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
  createdAt: "2026-10-27T16:00:00Z",
  updatedAt: "2026-10-27T16:00:00Z",
};

function annotations(): Annotations {
  return {
    all: [HIGHLIGHT],
    failure: null,
    add: vi.fn(),
    remove: vi.fn(),
    clearFailure: vi.fn(),
  };
}

describe("the identity the viewer depends on", () => {
  it("keeps the same `dismiss` across renders", () => {
    // Load-bearing, not tidiness. The viewer closes the menu from an effect whenever the
    // page under it moves, and an effect depending on a function rebuilt every render
    // would fire every render -- so the menu could never stay open long enough to click.
    const { result, rerender } = renderHook(() => useHighlightMenu(annotations()));
    const first = result.current.dismiss;

    rerender();
    rerender();

    expect(result.current.dismiss).toBe(first);
  });

  it("keeps the same `pick` across renders", () => {
    // Passed down to every page, so a new one each render would re-render all of them.
    const { result, rerender } = renderHook(() => useHighlightMenu(annotations()));
    const first = result.current.pick;

    rerender();

    expect(result.current.pick).toBe(first);
  });
});

describe("a highlight whose badge was clicked", () => {
  it("opens a menu where the badge is", () => {
    const { result } = renderHook(() => useHighlightMenu(annotations()));

    act(() => {
      result.current.pick(HIGHLIGHT, AT);
    });

    expect(result.current.open?.at).toEqual(AT);
  });

  it("offers removing it and not re-tagging it", () => {
    // Re-tagging would mint a new id, and the id is what `cite://` points at.
    const { result } = renderHook(() => useHighlightMenu(annotations()));

    act(() => {
      result.current.pick(HIGHLIGHT, AT);
    });

    expect(result.current.open?.onRemove).not.toBeNull();
    expect(result.current.open?.onChoose).toBeNull();
  });

  it("removes the one that was picked", () => {
    const held = annotations();
    const { result } = renderHook(() => useHighlightMenu(held));

    act(() => {
      result.current.pick(HIGHLIGHT, AT);
    });
    act(() => {
      result.current.open?.onRemove?.();
    });

    expect(held.remove).toHaveBeenCalledWith("hl-7");
  });

  it("closes once it has been removed", () => {
    const { result } = renderHook(() => useHighlightMenu(annotations()));

    act(() => {
      result.current.pick(HIGHLIGHT, AT);
    });
    act(() => {
      result.current.open?.onRemove?.();
    });

    expect(result.current.open).toBeNull();
  });

  it("closes when dismissed", () => {
    // The path the viewer takes when the page moves out from under it.
    const { result } = renderHook(() => useHighlightMenu(annotations()));

    act(() => {
      result.current.pick(HIGHLIGHT, AT);
    });
    act(() => {
      result.current.dismiss();
    });

    expect(result.current.open).toBeNull();
  });
});

describe("with nothing picked and nothing selected", () => {
  it("has no menu open", () => {
    const { result } = renderHook(() => useHighlightMenu(annotations()));

    expect(result.current.open).toBeNull();
  });
});
