// @vitest-environment jsdom
/**
 * Moving between an item's notes and one of its pages (2026-11-14): each is loaded and saved
 * through its own command, and the last words typed in one are saved to it, never to the
 * one opened next. Split from `useNotes.test.ts`, whose save loop this shares.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadNotes, saveNotes } from "../ipc/notes";
import { loadPage, savePage } from "../ipc/pages";
import { clearErrors, shownErrors } from "./errorLog";
import { SAVE_AFTER_MS, useNotes } from "./useNotes";

vi.mock("../ipc/notes", () => ({ loadNotes: vi.fn(), saveNotes: vi.fn() }));
vi.mock("../ipc/pages", () => ({ loadPage: vi.fn(), savePage: vi.fn() }));

const load = vi.mocked(loadNotes);
const save = vi.mocked(saveNotes);
const loadAPage = vi.mocked(loadPage);
const saveAPage = vi.mocked(savePage);

beforeEach(() => {
  vi.useFakeTimers();
  load.mockResolvedValue({ text: "# Week 2\n", version: "v1" });
  save.mockResolvedValue({ outcome: "saved", version: "v2" });
  loadAPage.mockResolvedValue({ text: "A page\n", version: "p1" });
  saveAPage.mockResolvedValue({ outcome: "saved", version: "p2" });
  clearErrors();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function pause() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS);
  });
}

describe("moving between the notes and a page", () => {
  async function onThePage() {
    const hook = renderHook<ReturnType<typeof useNotes>, { page: string | null }>(({ page }) => useNotes("/vault", "week-2/process", page), {
      initialProps: { page: "pg-1" },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    return hook;
  }

  it("opens a page from its own file", async () => {
    const { result } = await onThePage();

    expect(loadAPage).toHaveBeenCalledWith("/vault", "week-2/process", "pg-1");
    expect(result.current.loaded?.text).toBe("A page\n");
  });

  it("saves the last words to the page they were written in, not the notes opened next", async () => {
    const { result, rerender } = await onThePage();

    act(() => {
      result.current.change("half a sent");
    });
    rerender({ page: null });

    expect(saveAPage).toHaveBeenCalledWith("/vault", "week-2/process", "pg-1", "half a sent", "p1");
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.loaded?.text).toBe("# Week 2\n");
    expect(result.current.status).toBe("saved");
  });

  it("follows a save in flight with the words typed after it, based on the version it returned", async () => {
    let finish: (version: string) => void = () => undefined;
    saveAPage.mockReturnValueOnce(new Promise((resolve) => (finish = (version) => { resolve({ outcome: "saved", version }); })));
    const { result, rerender } = await onThePage();

    act(() => {
      result.current.change("first");
    });
    await pause();
    act(() => {
      result.current.change("first and more");
    });
    rerender({ page: null });
    await act(async () => {
      finish("p7");
      await vi.runAllTimersAsync();
    });

    expect(saveAPage).toHaveBeenLastCalledWith("/vault", "week-2/process", "pg-1", "first and more", "p7");
    // The notes opened meanwhile keep their own version: their next save is not a conflict.
    act(() => {
      result.current.change("notes");
    });
    await pause();
    expect(save).toHaveBeenLastCalledWith("/vault", "week-2/process", "notes", "v1");
  });

  it("says in the error panel when the words left behind could not be saved", async () => {
    saveAPage.mockResolvedValueOnce({ outcome: "conflict", onDisk: { text: "theirs", version: "p9" } });
    const { result, rerender } = await onThePage();

    act(() => {
      result.current.change("mine");
    });
    rerender({ page: null });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(shownErrors().map((logged) => logged.error.code)).toEqual(["ERR_NOTES_LEFT_UNSAVED"]);
  });
});
