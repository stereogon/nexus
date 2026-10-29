// @vitest-environment jsdom
/**
 * The viewer's page and zoom controls.
 *
 * These are the newest code in the viewer and the easiest to get subtly wrong: an arrow
 * that is enabled one page too long, a number field that fights the person typing into it.
 * None of it needs layout, so all of it can be checked here.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PdfToolbar } from "./PdfToolbar";

afterEach(cleanup);

function show(over: Partial<Parameters<typeof PdfToolbar>[0]> = {}) {
  const props = {
    title: "Raft Consensus",
    showing: 3,
    pages: 18,
    scale: 1.24,
    fitting: false,
    mode: "scroll" as const,
    limits: { min: 0.25, max: 6 },
    onClose: vi.fn(),
    onGoTo: vi.fn(),
    onZoom: vi.fn(),
    onFit: vi.fn(),
    onMode: vi.fn(),
    ...over,
  };

  render(<PdfToolbar {...props} />);

  return props;
}

const prev = () => screen.getByRole("button", { name: "Previous page" });
const next = () => screen.getByRole("button", { name: "Next page" });
const field = () => screen.getByLabelText("Page number");

describe("stepping through pages", () => {
  it("shows the page being read, counting from one", () => {
    show({ showing: 3, pages: 18 });

    // Zero-based inside the viewer, one-based on screen. Off by one here is the whole bug.
    expect((field() as HTMLInputElement).value).toBe("4");
    expect(screen.getByText("/ 18")).toBeDefined();
  });

  it("goes back and forward by one", () => {
    const props = show({ showing: 3 });

    fireEvent.click(prev());
    expect(props.onGoTo).toHaveBeenCalledWith(2);

    fireEvent.click(next());
    expect(props.onGoTo).toHaveBeenCalledWith(4);
  });

  it("cannot go back from the first page", () => {
    show({ showing: 0 });

    expect(prev().hasAttribute("disabled")).toBe(true);
    expect(next().hasAttribute("disabled")).toBe(false);
  });

  it("cannot go forward from the last page", () => {
    // The off-by-one that matters: on page 18 of 18, `showing` is 17.
    show({ showing: 17, pages: 18 });

    expect(next().hasAttribute("disabled")).toBe(true);
    expect(prev().hasAttribute("disabled")).toBe(false);
  });

  it("can still move on a two-page document", () => {
    show({ showing: 0, pages: 2 });

    expect(next().hasAttribute("disabled")).toBe(false);
  });
});

describe("jumping to a page", () => {
  // What the field does with what you type now lives in `PageField.test.tsx`. What is
  // left for the toolbar is that it is wired to the viewer at all.
  //
  // Two tests here used to pin the opposite contract -- navigate on every keystroke, and
  // ignore a page past the end rather than clamp it -- which is the behaviour that was
  // reported as broken on 2026-10-29. They were not weakened to pass; the rule they
  // described was wrong, and its replacement is tested in full beside the field.
  it("reaches the viewer with a zero-based index", () => {
    const props = show({ pages: 18 });

    fireEvent.change(field(), { target: { value: "12" } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(props.onGoTo).toHaveBeenCalledWith(11);
  });

  it("does not chase a number that is still past the end", () => {
    const props = show({ pages: 18 });

    fireEvent.change(field(), { target: { value: "99" } });

    expect(props.onGoTo).not.toHaveBeenCalled();
  });
});

describe("a document with no pages", () => {
  it("disables the controls and shows no page number", () => {
    show({ pages: 0, showing: 0 });

    expect(prev().hasAttribute("disabled")).toBe(true);
    expect(next().hasAttribute("disabled")).toBe(true);
    expect((field() as HTMLInputElement).value).toBe("");
    expect(screen.getByText("—")).toBeDefined();
  });
});

describe("zoom", () => {
  it("steps in and out", () => {
    const props = show();

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(props.onZoom).toHaveBeenCalledWith(-1);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(props.onZoom).toHaveBeenCalledWith(1);
  });

  it("shows the scale as a whole percentage", () => {
    show({ scale: 1.237 });

    expect(screen.getByText("124%")).toBeDefined();
  });

  it("stops at each end rather than letting the scale drift past it", () => {
    cleanup();
    show({ scale: 0.25 });
    expect(screen.getByRole("button", { name: "Zoom out" }).hasAttribute("disabled")).toBe(
      true,
    );

    cleanup();
    show({ scale: 6 });
    expect(screen.getByRole("button", { name: "Zoom in" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("says whether it is fitting the width", () => {
    show({ fitting: true });

    expect(
      screen.getByRole("button", { name: "Fit width" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("the layout switch", () => {
  it("marks the mode in use", () => {
    show({ mode: "page" });

    expect(screen.getByRole("button", { name: "Page" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Scroll" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("asks for the other mode", () => {
    const props = show({ mode: "scroll" });

    fireEvent.click(screen.getByRole("button", { name: "Page" }));

    expect(props.onMode).toHaveBeenCalledWith("page");
  });
});
