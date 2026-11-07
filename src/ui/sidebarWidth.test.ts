import { describe, expect, it } from "vitest";

import { BESIDE_MIN, fitSidebarWidth, SIDEBAR_MAX, SIDEBAR_MIN, widestSidebar } from "./sidebarWidth";

describe("the sidebar's width", () => {
  it("is what was chosen, when the window has room", () => {
    expect(fitSidebarWidth(320, 1400)).toBe(320);
  });

  it("is never narrower than a row can be read in, nor wider than a sidebar", () => {
    expect(fitSidebarWidth(40, 1400)).toBe(SIDEBAR_MIN);
    expect(fitSidebarWidth(900, 2400)).toBe(SIDEBAR_MAX);
  });

  it("leaves the panes beside it their room in a small window", () => {
    expect(widestSidebar(800)).toBe(800 - BESIDE_MIN);
    expect(fitSidebarWidth(460, 800)).toBe(800 - BESIDE_MIN);
  });

  it("keeps its minimum when even that leaves the panes too little", () => {
    expect(fitSidebarWidth(300, 600)).toBe(SIDEBAR_MIN);
  });
});
