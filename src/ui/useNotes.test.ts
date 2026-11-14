// @vitest-environment jsdom
/**
 * Saving notes as you type, and what happens when the file changed elsewhere.
 *
 * The IPC is mocked: what is under test is the save loop's rules — when it saves, what it
 * bases a save on, and that it never writes over the other version of a conflict by
 * itself. The version check is Rust's, tested in `lecture-fs`.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadNotes, saveNotes } from "../ipc/notes";
import { clearErrors } from "./errorLog";
import { SAVE_AFTER_MS, useNotes } from "./useNotes";

vi.mock("../ipc/notes", () => ({ loadNotes: vi.fn(), saveNotes: vi.fn() }));
// Pages are `useNotesPages.test.ts`'s; mocked here so nothing reaches a real IPC.
vi.mock("../ipc/pages", () => ({ loadPage: vi.fn(), savePage: vi.fn() }));

const load = vi.mocked(loadNotes);
const save = vi.mocked(saveNotes);

beforeEach(() => {
  vi.useFakeTimers();
  load.mockResolvedValue({ text: "# Week 2\n", version: "v1" });
  save.mockResolvedValue({ outcome: "saved", version: "v2" });
  clearErrors();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** Renders the hook and lets the load land. */
async function opened() {
  const hook = renderHook(() => useNotes("/vault", "week-2/process"));

  await act(async () => {
    await vi.runAllTimersAsync();
  });

  return hook;
}

async function pause() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS);
  });
}

describe("opening", () => {
  it("starts from the text on disk, saved", async () => {
    const { result } = await opened();

    expect(result.current.loaded?.text).toBe("# Week 2\n");
    expect(result.current.status).toBe("saved");
  });
});

describe("typing", () => {
  it("is not saved on every keystroke", async () => {
    const { result } = await opened();

    act(() => {
      result.current.change("# Week 2\nR");
      result.current.change("# Week 2\nRa");
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("unsaved");
  });

  it("is saved once typing pauses, based on the version it was read at", async () => {
    const { result } = await opened();

    act(() => {
      result.current.change("# Week 2\nRaft");
    });
    await pause();

    expect(save).toHaveBeenCalledWith("/vault", "week-2/process", "# Week 2\nRaft", "v1");
    expect(result.current.status).toBe("saved");
  });

  it("bases the next save on the version the last one returned", async () => {
    // Otherwise a person's second save would conflict with their own first.
    const { result } = await opened();

    act(() => {
      result.current.change("one");
    });
    await pause();
    act(() => {
      result.current.change("two");
    });
    await pause();

    expect(save).toHaveBeenLastCalledWith("/vault", "week-2/process", "two", "v2");
  });

  it("is saved when the lecture closes mid-sentence", async () => {
    const { result, unmount } = await opened();

    act(() => {
      result.current.change("half a sent");
    });
    unmount();

    expect(save).toHaveBeenCalledWith("/vault", "week-2/process", "half a sent", "v1");
  });
});

describe("a conflict", () => {
  const THEIRS = { text: "edited on the iPad\n", version: "v9" };

  async function conflicted() {
    save.mockResolvedValueOnce({ outcome: "conflict", onDisk: THEIRS });
    const hook = await opened();

    act(() => {
      hook.result.current.change("mine");
    });
    await pause();

    return hook;
  }

  it("keeps both versions and says so", async () => {
    const { result } = await conflicted();

    expect(result.current.status).toBe("conflict");
    expect(result.current.onDisk).toEqual(THEIRS);
  });

  it("stops saving until the person chooses", async () => {
    // Nothing may be written over the other version by accident.
    const { result } = await conflicted();
    save.mockClear();

    act(() => {
      result.current.change("mine, continued");
    });
    await pause();

    expect(save).not.toHaveBeenCalled();
  });

  it("saves the person's text over the other version when they keep theirs", async () => {
    const { result } = await conflicted();

    act(() => {
      result.current.change("mine, final");
    });
    await act(async () => {
      result.current.keepMine();
      await vi.runAllTimersAsync();
    });

    expect(save).toHaveBeenLastCalledWith("/vault", "week-2/process", "mine, final", "v9");
    expect(result.current.onDisk).toBeNull();
  });

  it("hands the editor the other version when they take it", async () => {
    const { result } = await conflicted();
    const before = result.current.generation;

    act(() => {
      result.current.takeTheirs();
    });

    expect(result.current.loaded).toEqual(THEIRS);
    expect(result.current.generation).toBe(before + 1);
    expect(result.current.status).toBe("saved");
  });
});

describe("a failed save", () => {
  it("keeps the text unsaved and says so", async () => {
    save.mockRejectedValueOnce({ code: "ERR_IO", remediation: "The disk is full." });
    const { result } = await opened();

    act(() => {
      result.current.change("mine");
    });
    await pause();

    expect(result.current.status).toBe("failed");
    expect(result.current.failure?.code).toBe("ERR_IO");
  });
});

describe("typing during a save", () => {
  it("goes next, based on the version that save returned, not as a conflict", async () => {
    let finish: (value: { outcome: "saved"; version: string }) => void = () => undefined;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = await opened();

    act(() => {
      result.current.change("first");
    });
    await pause();
    act(() => {
      result.current.change("first and second");
    });
    await act(async () => {
      finish({ outcome: "saved", version: "v2" });
      await vi.runAllTimersAsync();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("/vault", "week-2/process", "first and second", "v2");
    expect(result.current.status).toBe("saved");
  });
});

describe("a failed save, then more typing", () => {
  it("tries again on the next pause, not in a loop", async () => {
    save.mockRejectedValueOnce({ code: "ERR_IO", remediation: "The disk is full." });
    const { result } = await opened();

    act(() => {
      result.current.change("mine");
    });
    await pause();
    expect(save).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.change("mine, again");
    });
    await pause();

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });
});

describe("the highlights the notes cite", () => {
  it("are known from the notes as loaded", async () => {
    load.mockResolvedValueOnce({ text: "See cite://hl-1 and cite://hl-2.", version: "v1" });
    const { result } = await opened();

    expect([...result.current.cited]).toEqual(["hl-1", "hl-2"]);
  });

  it("follow the notes as they are typed", async () => {
    const { result } = await opened();

    act(() => {
      result.current.change("Now citing cite://hl-9");
    });

    expect(result.current.cited.has("hl-9")).toBe(true);
  });

  it("stay the same set while typing changes nothing cited", async () => {
    // So an ordinary sentence does not re-render every page of the document.
    load.mockResolvedValueOnce({ text: "cite://hl-1", version: "v1" });
    const { result } = await opened();
    const before = result.current.cited;

    act(() => {
      result.current.change("cite://hl-1 and more words");
    });

    expect(result.current.cited).toBe(before);
  });
});
