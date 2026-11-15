// @vitest-environment jsdom
/**
 * The sidebar's foot: the library on its own, and Settings, which holds the theme, the font and
 * the layout (2026-11-14) and the error panel (2026-11-07) and says on its control when there have been
 * errors. And the same controls as the rail beside a hidden sidebar, under the N.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearErrors, noteError } from "./errorLog";
import { SidebarFoot } from "./SidebarFoot";
import type { ThemeName } from "./themes";

afterEach(() => {
  cleanup();
  clearErrors();
});

function show(theme: ThemeName = "system", rail = false) {
  const props = {
    rail,
    layout: "classic" as const,
    onChooseLayout: vi.fn(),
    font: "theme" as const,
    onChooseFont: vi.fn(),
    root: "/Users/me/NexusVault",
    libraryShown: false,
    onToggleLibrary: vi.fn(),
    onShowErrors: vi.fn(),
    theme,
    onChooseTheme: vi.fn(),
  };

  render(<SidebarFoot {...props} />);

  return props;
}

describe("the foot of the sidebar", () => {
  it("keeps the theme in Settings, checked where it is, and chooses from it", () => {
    const props = show("neon");

    expect(screen.queryByRole("button", { name: "Theme" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const settings = screen.getByRole("dialog", { name: "Settings" });
    expect(screen.getByRole("radio", { name: /Neon/u }).getAttribute("aria-checked")).toBe("true");
    expect(within(screen.getByRole("radiogroup", { name: "Theme" })).getAllByRole("radio")).toHaveLength(26);
    expect(settings.textContent).toContain("/Users/me/NexusVault");

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Theme" })).getByRole("radio", { name: /Sepia/u }));
    expect(props.onChooseTheme).toHaveBeenCalledWith("sepia");
    // Left open, so themes can be tried one after another.
    expect(screen.getByRole("dialog", { name: "Settings" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("chooses the layout in Settings, Classic checked to start with, and stays open", () => {
    const props = show();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const layouts = within(screen.getByRole("radiogroup", { name: "Layout" }));

    expect(layouts.getByRole("radio", { name: /Classic/u }).getAttribute("aria-checked")).toBe("true");
    expect(layouts.getByRole("radio", { name: /Islands/u }).getAttribute("aria-checked")).toBe("false");

    fireEvent.click(layouts.getByRole("radio", { name: /Islands/u }));
    expect(props.onChooseLayout).toHaveBeenCalledWith("islands");
    expect(screen.getByRole("dialog", { name: "Settings" })).not.toBeNull();
  });

  it("chooses the font in Settings, the theme's checked to start with, and stays open", () => {
    const props = show();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const fonts = within(screen.getByRole("radiogroup", { name: "Font" }));

    expect(fonts.getAllByRole("radio")).toHaveLength(3);
    expect(fonts.getByRole("radio", { name: /^Theme/u }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(fonts.getByRole("radio", { name: /Mono/u }));
    expect(props.onChooseFont).toHaveBeenCalledWith("mono");
    fireEvent.click(fonts.getByRole("radio", { name: /System/u }));
    expect(props.onChooseFont).toHaveBeenCalledWith("system");
    expect(screen.getByRole("dialog", { name: "Settings" })).not.toBeNull();
  });

  it("as the rail, carries the N above the same two controls, and no path", () => {
    show("system", true);

    expect(screen.getByRole("img", { name: "Nexus" }).textContent).toBe("N");
    expect(screen.getByRole("button", { name: "Highlights library" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).not.toBeNull();
    expect(screen.queryByText("/Users/me/NexusVault")).toBeNull();
  });

  it("opens the error panel from Settings, and closes Settings on the way", () => {
    const props = show();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Errors since launch/u }));

    expect(props.onShowErrors).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("says on the Settings control itself when there have been errors", () => {
    noteError({ code: "ERR_TEST", remediation: "Something to do." });
    show();

    expect(screen.getByRole("button", { name: "Settings, 1 error since launch" })).not.toBeNull();
  });

  it("keeps the library at the foot, on its own", () => {
    const props = show();

    fireEvent.click(screen.getByRole("button", { name: "Highlights library" }));

    expect(props.onToggleLibrary).toHaveBeenCalledOnce();
  });
});
