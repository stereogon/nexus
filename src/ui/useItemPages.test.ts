// @vitest-environment jsdom
/**
 * The page open in the notes pane belongs to its item (2026-11-17). Moving to another item
 * with a page open had, for one render, the new item and the old page: the notes pane asked
 * the new item for that page, and ERR_PAGE_NOT_FOUND reached the error panel whenever the
 * answer came back before the reset did.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { loadNotes } from "../ipc/notes";
import { listPages, loadPage } from "../ipc/pages";
import { useItemPages } from "./useItemPages";
import { useNotes } from "./useNotes";

vi.mock("../ipc/notes", () => ({ loadNotes: vi.fn(), saveNotes: vi.fn() }));
vi.mock("../ipc/pages", () => ({ listPages: vi.fn(), loadPage: vi.fn(), savePage: vi.fn() }));

beforeEach(() => {
  vi.mocked(loadNotes).mockResolvedValue({ text: "# Notes\n", version: "v1" });
  vi.mocked(loadPage).mockResolvedValue({ text: "A page\n", version: "p1" });
  vi.mocked(listPages).mockResolvedValue({ pages: [], unreadable: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

/** The two hooks as `Reading` and `NotesPane` chain them. */
function useOpenItem(directory: string) {
  const item = useItemPages("/vault", directory);
  const notes = useNotes("/vault", directory, item.open);

  return { item, notes };
}

it("never asks another item for the page left open in the last one", async () => {
  const { result, rerender } = renderHook(({ directory }) => useOpenItem(directory), { initialProps: { directory: "week-2/process" } });

  await act(async () => {
    result.current.item.openNote("pg-1");
    await Promise.resolve();
  });
  expect(loadPage).toHaveBeenCalledWith("/vault", "week-2/process", "pg-1");

  await act(async () => {
    rerender({ directory: "week-3/memory" });
    await Promise.resolve();
  });

  expect(loadPage).not.toHaveBeenCalledWith("/vault", "week-3/memory", "pg-1");
  expect(result.current.item.open).toBeNull();
  expect(loadNotes).toHaveBeenCalledWith("/vault", "week-3/memory");
});

it("opens a page chosen in the new item", async () => {
  const { result, rerender } = renderHook(({ directory }) => useOpenItem(directory), { initialProps: { directory: "week-2/process" } });

  await act(async () => {
    rerender({ directory: "week-3/memory" });
    await Promise.resolve();
  });
  await act(async () => {
    result.current.item.openNote("pg-9");
    await Promise.resolve();
  });

  expect(result.current.item.open).toBe("pg-9");
  expect(loadPage).toHaveBeenCalledWith("/vault", "week-3/memory", "pg-9");
});
