// @vitest-environment jsdom
/**
 * The page-tone store: a choice applies at once and is recorded, and the recorded tone,
 * arriving after launch, never undoes a choice made before it arrived.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({
  lastPageTone: vi.fn<() => Promise<"printed" | "sepia" | "dusk" | "night">>(),
  rememberPageTone: vi.fn<(tone: "printed" | "sepia" | "dusk" | "night") => Promise<void>>(),
}));

vi.mock("../ipc/pageTone", () => ipc);

beforeEach(() => {
  vi.resetModules();
  ipc.lastPageTone.mockReset();
  ipc.rememberPageTone.mockReset().mockResolvedValue(undefined);
  document.documentElement.removeAttribute("data-pages");
});

describe("the page tone", () => {
  it("applies the recorded tone at launch", async () => {
    ipc.lastPageTone.mockResolvedValue("dusk");
    const { loadPageTone } = await import("./pageTone");

    await loadPageTone();
    expect(document.documentElement.getAttribute("data-pages")).toBe("dusk");
  });

  it("applies a choice at once and records it", async () => {
    const { choosePageTone } = await import("./pageTone");

    choosePageTone("night");
    expect(document.documentElement.getAttribute("data-pages")).toBe("night");
    expect(ipc.rememberPageTone).toHaveBeenCalledWith("night");
  });

  it("keeps a choice made before the recorded tone arrives", async () => {
    let arrive: (tone: "printed" | "sepia" | "dusk" | "night") => void = () => undefined;
    ipc.lastPageTone.mockReturnValue(
      new Promise((resolve) => {
        arrive = resolve;
      }),
    );
    const { choosePageTone, loadPageTone } = await import("./pageTone");

    const loading = loadPageTone();
    choosePageTone("night");
    arrive("printed");
    await loading;

    expect(document.documentElement.getAttribute("data-pages")).toBe("night");
  });
});
