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
    addArea: vi.fn(),
    remove: vi.fn(),
    retag: vi.fn(),
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

  it("offers re-marking it as well as removing it", () => {
    // Until 2026-11-05 it offered Remove alone, because re-marking meant remove-and-add,
    // which minted a new id and broke every `cite://` link. `retag` keeps the id.
    const { result } = renderHook(() => useHighlightMenu(annotations()));

    act(() => {
      result.current.pick(HIGHLIGHT, AT);
    });

    expect(result.current.open?.onRemove).not.toBeNull();
    expect(result.current.open?.onChoose).not.toBeNull();
  });

  it("says what the picked highlight is marked as now", () => {
    const { result } = renderHook(() => useHighlightMenu(annotations()));

    act(() => {
      result.current.pick(HIGHLIGHT, AT);
    });

    expect(result.current.open?.current).toBe("key");
  });

  it("re-marks the one that was picked, by id, and closes", () => {
    const held = annotations();
    const { result } = renderHook(() => useHighlightMenu(held));

    act(() => {
      result.current.pick(HIGHLIGHT, AT);
    });
    act(() => {
      result.current.open?.onChoose?.("exam");
    });

    expect(held.retag).toHaveBeenCalledWith("hl-7", "exam");
    expect(result.current.open).toBeNull();
  });

  it("offers no meanings for a text box, which cannot hold one", () => {
    const { result } = renderHook(() => useHighlightMenu(annotations()));
    const box: Annotation = {
      kind: "textBox",
      id: "tb-1",
      page: 2,
      region: { x: 0.2, y: 0.2, width: 0.3, height: 0.1 },
      text: "Important exam formula",
      createdAt: "2026-10-27T16:00:00Z",
      updatedAt: "2026-10-27T16:00:00Z",
    };

    act(() => {
      result.current.pick(box, AT);
    });

    expect(result.current.open?.onChoose).toBeNull();
    expect(result.current.open?.current).toBeNull();
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

describe("a box drawn with Option held", () => {
  const REGION = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };

  it("opens a menu of meanings, with nothing pressed and nothing to remove", () => {
    const { result } = renderHook(() => useHighlightMenu(annotations()));

    act(() => {
      result.current.draw(3, REGION, AT);
    });

    expect(result.current.open?.at).toEqual(AT);
    expect(result.current.open?.current).toBeNull();
    expect(result.current.open?.onRemove).toBeNull();
  });

  it("stores the box on its page with the meaning chosen, and closes", () => {
    const held = annotations();
    const { result } = renderHook(() => useHighlightMenu(held));

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
    const { result } = renderHook(() => useHighlightMenu(annotations()));

    act(() => {
      result.current.draw(3, REGION, AT);
    });

    expect(result.current.drawn).toEqual({ pageIndex: 3, region: REGION, at: AT });
  });

  it("is forgotten when dismissed, as when the page moves under it", () => {
    const { result } = renderHook(() => useHighlightMenu(annotations()));

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
    const { result } = renderHook(() => useHighlightMenu(annotations()));

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
    const { result, rerender } = renderHook(() => useHighlightMenu(annotations()));
    const first = result.current.draw;

    rerender();

    expect(result.current.draw).toBe(first);
  });
});
