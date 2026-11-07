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
    kind: "document",
    title: "Raft Consensus",
    number: null,
    numberInTitle: null,
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
    onChooseTheme: vi.fn(),
    errorsShown: false,
    onToggleErrors: vi.fn(),
    libraryShown: false,
    onToggleLibrary: vi.fn(),
    ...over,
  };

  render(<TitleBar {...props} />);

  return props;
}

describe("the breadcrumb", () => {
  it("shows the folders the item is in, then its title", () => {
    // From where it is, not its facets: course and week are no longer typed in, and an
    // item filed under facets that disagree with its folder would name a place it is not.
    show({ lecture: lecture({ course: "Ignored", week: "Ignored" }) });

    expect(screen.getByText("CS454 / Week 03 /")).toBeDefined();
    expect(screen.getByText("Raft Consensus")).toBeDefined();
  });

  it("shows no path for an item at the top of the vault", () => {
    show({ lecture: lecture({ directory: "raft" }) });

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

  it("opens the theme picker with the current theme checked, and chooses from it", () => {
    const props = show({ theme: "neon" });

    fireEvent.click(screen.getByRole("button", { name: "Theme" }));

    expect(screen.getByRole("menuitemradio", { name: /Neon/u }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(16);

    fireEvent.click(screen.getByRole("menuitemradio", { name: /Sepia/u }));

    expect(props.onChooseTheme).toHaveBeenCalledWith("sepia");
  });

  it("closes the picker on Escape", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: "Theme" })).toBeNull();
  });

  it("opens the error panel from where the canvas puts the diagnostics control", () => {
    // Until 2026-11-05 this was drawn disabled, waiting for Milestone 5.
    const props = show();

    fireEvent.click(screen.getByRole("button", { name: "Errors" }));

    expect(props.onToggleErrors).toHaveBeenCalled();
  });

  it("shows the errors control pressed while the panel is open", () => {
    show({ errorsShown: true });

    expect(screen.getByRole("button", { name: "Errors" }).getAttribute("aria-pressed")).toBe("true");
  });
});
