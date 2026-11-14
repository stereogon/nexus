// @vitest-environment jsdom
/**
 * The window bar: the sidebar's control, named for what it will do, and Search everything,
 * which says its shortcut. Both were the sidebar's until 2026-11-14.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WindowBar } from "./WindowBar";

afterEach(() => {
  cleanup();
});

describe("the window bar", () => {
  it("hides the sidebar while it is shown, and shows it while it is hidden", () => {
    const onToggleSidebar = vi.fn();
    const { rerender } = render(<WindowBar onSearch={vi.fn()} onToggleSidebar={onToggleSidebar} sidebarShown />);

    fireEvent.click(screen.getByRole("button", { name: "Hide sidebar" }));
    expect(onToggleSidebar).toHaveBeenCalledOnce();

    rerender(<WindowBar onSearch={vi.fn()} onToggleSidebar={onToggleSidebar} sidebarShown={false} />);
    expect(screen.getByRole("button", { name: "Show sidebar" })).not.toBeNull();
  });

  it("opens the search window from its control, which says the shortcut", () => {
    const onSearch = vi.fn();

    render(<WindowBar onSearch={onSearch} onToggleSidebar={vi.fn()} sidebarShown />);

    const control = screen.getByRole("button", { name: /Search everything/u });

    fireEvent.click(control);
    expect(onSearch).toHaveBeenCalledOnce();
    expect(control.textContent).toContain("⌘P");
  });
});
