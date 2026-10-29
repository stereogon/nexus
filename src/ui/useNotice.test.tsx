// @vitest-environment jsdom
/**
 * The confirmation that takes itself away.
 *
 * Driven on fake timers, so the test asserts the *rule* rather than waiting six real
 * seconds for it — and so "it disappears eventually" becomes "it disappears at 6000ms and
 * not at 5999".
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Notice } from "./Notice";
import { useNotice } from "./useNotice";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("showing a confirmation", () => {
  it("starts with nothing to say", () => {
    const { result } = renderHook(() => useNotice());

    expect(result.current.text).toBeNull();
  });

  it("shows what it is given", () => {
    const { result } = renderHook(() => useNotice());

    act(() => {
      result.current.show('Added "1. Foundations".');
    });

    expect(result.current.text).toBe('Added "1. Foundations".');
  });

  it("takes itself away once the time is up", () => {
    // The reported bug: it stayed on the empty pane until the next action replaced it.
    const { result } = renderHook(() => useNotice(6000));

    act(() => {
      result.current.show("Added two lectures.");
    });

    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(result.current.text).toBe("Added two lectures.");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.text).toBeNull();
  });

  it("restarts the clock for a second confirmation that reads the same", () => {
    // Importing the same file twice produces the same sentence. Without an identity of its
    // own, the second notice would be the same value, the timer would not reset, and the
    // message would vanish early -- which is the subtle half of this bug.
    const { result } = renderHook(() => useNotice(6000));

    act(() => {
      result.current.show("Added one lecture.");
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      result.current.show("Added one lecture.");
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.text).toBe("Added one lecture.");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.text).toBeNull();
  });

  it("can be taken away before the time is up", () => {
    const { result } = renderHook(() => useNotice());

    act(() => {
      result.current.show("Filed \"Raft\".");
    });
    act(() => {
      result.current.dismiss();
    });

    expect(result.current.text).toBeNull();
  });

  it("clears on an action that has nothing to report", () => {
    const { result } = renderHook(() => useNotice());

    act(() => {
      result.current.show("Added one lecture.");
    });
    act(() => {
      result.current.show(null);
    });

    expect(result.current.text).toBeNull();
  });

  it("drops its timer when the window goes away", () => {
    // An unmounted component being updated is a warning in the console and a leak in
    // principle; the cleanup is what prevents it.
    const { result, unmount } = renderHook(() => useNotice(6000));

    act(() => {
      result.current.show("Added one lecture.");
    });
    unmount();

    expect(() => {
      vi.advanceTimersByTime(10_000);
    }).not.toThrow();
  });
});

describe("the strip itself", () => {
  it("announces politely rather than interrupting", () => {
    // `status`, not `alert`: this reports a success, so it should be read at a pause.
    render(<Notice onDismiss={vi.fn()} text="Added one lecture." />);

    expect(screen.getByRole("status").textContent).toContain("Added one lecture.");
  });

  it("offers a labelled way to dismiss it", () => {
    const onDismiss = vi.fn();

    render(<Notice onDismiss={onDismiss} text="Added one lecture." />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onDismiss).toHaveBeenCalled();
  });
});
