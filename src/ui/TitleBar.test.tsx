// @vitest-environment jsdom
/**
 * The title bar: where you are, and the three chrome controls.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConversionState, LectureRow } from "../ipc/vault";
import { TitleBar } from "./TitleBar";

afterEach(cleanup);

function lecture(over: Partial<LectureRow> = {}): LectureRow {
  return {
    directory: "CS454/Week 03/01-raft",
    title: "Raft Consensus",
    sequence: "a0",
    course: "CS454",
    module: null,
    week: "Week 03",
    tags: [],
    conversion: "ready" satisfies ConversionState,
    documentReady: true,
    ...over,
  };
}

function show(over: Partial<Parameters<typeof TitleBar>[0]> = {}) {
  const props = {
    lecture: lecture(),
    sidebarShown: true,
    theme: "system" as const,
    onToggleSidebar: vi.fn(),
    onCycleTheme: vi.fn(),
    ...over,
  };

  render(<TitleBar {...props} />);

  return props;
}

describe("the breadcrumb", () => {
  it("shows the facets a lecture carries, then its title", () => {
    show();

    expect(screen.getByText("CS454 / Week 03 /")).toBeDefined();
    expect(screen.getByText("Raft Consensus")).toBeDefined();
  });

  it("leaves out the facets a lecture does not have", () => {
    show({ lecture: lecture({ course: null, week: null }) });

    expect(screen.queryByText(/\//u)).toBeNull();
    expect(screen.getByText("Raft Consensus")).toBeDefined();
  });

  it("shows nothing when no lecture is open", () => {
    show({ lecture: null });

    expect(screen.queryByText("Raft Consensus")).toBeNull();
  });
});

describe("the chrome controls", () => {
  it("says whether the sidebar is showing", () => {
    show({ sidebarShown: true });
    expect(
      screen.getByRole("button", { name: "Toggle sidebar" }).getAttribute("aria-pressed"),
    ).toBe("true");

    cleanup();

    show({ sidebarShown: false });
    expect(
      screen.getByRole("button", { name: "Toggle sidebar" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("asks for the sidebar to be toggled", () => {
    const props = show();

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    expect(props.onToggleSidebar).toHaveBeenCalled();
  });

  it("names the theme it is currently on", () => {
    show({ theme: "dark" });

    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeDefined();
  });

  it("cycles the theme", () => {
    const props = show({ theme: "system" });

    fireEvent.click(screen.getByRole("button", { name: /^Theme/u }));

    expect(props.onCycleTheme).toHaveBeenCalled();
  });

  it("leaves the diagnostics control visibly disabled rather than absent", () => {
    // It is on the canvas and belongs to Milestone 5. A control that appears later moves
    // everything beside it, so it is drawn and disabled.
    show();

    expect(
      screen.getByRole("button", { name: "Diagnostic logs" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
