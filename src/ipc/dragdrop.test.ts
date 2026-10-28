/**
 * The drag payload, which arrives from outside the app.
 *
 * Whatever someone drags onto the window becomes this message, so it is the least
 * trustworthy payload the UI handles — and the one place where a bad value must not be able
 * to leave an overlay stuck across the vault with no gesture left to dismiss it.
 */
import { describe, expect, it, vi } from "vitest";

import { dispatchDrag, type DragHandlers } from "./dragdrop";
import { ImportableFormatsSchema } from "./formats";

function spies(): DragHandlers & {
  readonly calls: () => Record<string, number>;
} {
  const onEnter = vi.fn();
  const onLeave = vi.fn();
  const onDrop = vi.fn();

  return {
    onEnter,
    onLeave,
    onDrop,
    calls: () => ({
      enter: onEnter.mock.calls.length,
      leave: onLeave.mock.calls.length,
      drop: onDrop.mock.calls.length,
    }),
  };
}

describe("dispatching a drag event", () => {
  it("shows the overlay when files come over the window", () => {
    const handlers = spies();

    dispatchDrag(
      { type: "enter", paths: ["/a/raft.pdf"], position: { x: 1, y: 2 } },
      handlers,
    );

    expect(handlers.calls()).toStrictEqual({ enter: 1, leave: 0, drop: 0 });
  });

  it("hands over the paths when they land", () => {
    const handlers = spies();

    dispatchDrag(
      { type: "drop", paths: ["/a/raft.pdf", "/a/paxos.pptx"], position: { x: 0, y: 0 } },
      handlers,
    );

    expect(handlers.onDrop).toHaveBeenCalledWith(["/a/raft.pdf", "/a/paxos.pptx"]);
  });

  it("ignores movement, which fires on every pixel", () => {
    // Handling `over` would re-render the window per mouse move for no visible difference.
    const handlers = spies();

    dispatchDrag({ type: "over", position: { x: 4, y: 9 } }, handlers);

    expect(handlers.calls()).toStrictEqual({ enter: 0, leave: 0, drop: 0 });
  });

  it("hides the overlay when the drag leaves", () => {
    const handlers = spies();

    dispatchDrag({ type: "leave" }, handlers);

    expect(handlers.calls()).toStrictEqual({ enter: 0, leave: 1, drop: 0 });
  });

  it("treats a payload it cannot read as the drag having left", () => {
    // The load-bearing case. Anything else leaves the overlay covering the vault with no
    // drag in progress to end it, and no way back short of restarting the app.
    for (const payload of [
      undefined,
      null,
      "drop",
      7,
      {},
      { type: "sideways" },
      { type: "drop" },
      { type: "drop", paths: "not-a-list" },
      { type: "drop", paths: [1, 2] },
      { type: "enter", paths: null },
    ]) {
      const handlers = spies();

      dispatchDrag(payload, handlers);

      expect(handlers.calls(), `payload: ${JSON.stringify(payload)}`).toStrictEqual({
        enter: 0,
        leave: 1,
        drop: 0,
      });
    }
  });

  it("accepts a drop of nothing, which is not a malformed drop", () => {
    // Dragging a folder can produce an empty list. It is a no-op, not a bad message, and
    // must not be reported as one.
    const handlers = spies();

    dispatchDrag({ type: "drop", paths: [], position: { x: 0, y: 0 } }, handlers);

    expect(handlers.onDrop).toHaveBeenCalledWith([]);
    expect(handlers.calls()).toStrictEqual({ enter: 0, leave: 0, drop: 1 });
  });
});

describe("the importable formats contract", () => {
  it("accepts the list the Rust command produces", () => {
    // The five the canvas shows as chips, in `DocumentFormat::ALL` order.
    expect(
      ImportableFormatsSchema.parse(["pdf", "pptx", "ppt", "docx", "doc"]),
    ).toStrictEqual(["pdf", "pptx", "ppt", "docx", "doc"]);
  });

  it("refuses an empty list, which would mean Nexus imports nothing", () => {
    expect(() => ImportableFormatsSchema.parse([])).toThrow();
  });

  it("refuses anything that is not a list of non-empty strings", () => {
    for (const payload of [null, "pdf", ["pdf", ""], ["pdf", 2], {}]) {
      expect(() => ImportableFormatsSchema.parse(payload)).toThrow();
    }
  });
});
