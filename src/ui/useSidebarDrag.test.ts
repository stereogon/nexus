/**
 * Where a dragged item or folder may go.
 */
import { describe, expect, it } from "vitest";

import { canDrop } from "./useSidebarDrag";

describe("dropping in the sidebar", () => {
  it("moves an item into another folder, or up to the top, but not where it already is", () => {
    expect(canDrop({ kind: "item", path: "week-2/raft" }, "week-1")).toBe(true);
    expect(canDrop({ kind: "item", path: "week-2/raft" }, "")).toBe(true);
    expect(canDrop({ kind: "item", path: "week-2/raft" }, "week-2")).toBe(false);
  });

  it("never puts a folder inside itself", () => {
    expect(canDrop({ kind: "folder", path: "week-1" }, "week-2")).toBe(true);
    expect(canDrop({ kind: "folder", path: "week-1" }, "week-1")).toBe(false);
    expect(canDrop({ kind: "folder", path: "week-1" }, "week-1/extra")).toBe(false);
    // A name that only starts the same is a different folder.
    expect(canDrop({ kind: "folder", path: "week-1" }, "week-10")).toBe(true);
  });
});
