// @vitest-environment jsdom
/**
 * The document's header strip: where it is, the tool, the view, find, the notes, closing.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PdfToolbar } from "./PdfToolbar";

afterEach(cleanup);

function show(over: Partial<Parameters<typeof PdfToolbar>[0]> = {}) {
  const props = {
    title: "Raft Consensus",
    place: "CS454 / Week 3",
    mode: "scroll" as const,
    onClose: vi.fn(),
    onMode: vi.fn(),
    boxing: false,
    onBoxing: vi.fn<(on: boolean) => void>(),
    onFind: vi.fn(),
    notesOpen: true,
    onNotes: vi.fn(),
    ...over,
  };

  render(<PdfToolbar {...props} />);

  return props;
}

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

describe("the tool", () => {
  // Box is for a touchpad, where Option-drag needs a physical click held while the finger
  // moves; Select is the ordinary text selection.
  const select = () => screen.getByRole("button", { name: "Select" });
  const box = () => screen.getByRole("button", { name: "Box" });

  it("is Select to begin with, and says so", () => {
    show();

    expect(select().getAttribute("aria-pressed")).toBe("true");
    expect(box().getAttribute("aria-pressed")).toBe("false");
  });

  it("asks for the box, and back for selecting", () => {
    const props = show();

    fireEvent.click(box());
    expect(props.onBoxing).toHaveBeenLastCalledWith(true);

    fireEvent.click(select());
    expect(props.onBoxing).toHaveBeenLastCalledWith(false);
  });

  it("shows the box chosen when it is", () => {
    show({ boxing: true });

    expect(box().getAttribute("aria-pressed")).toBe("true");
  });
});

describe("find, notes and closing", () => {
  it("opens find, toggles the notes and closes the document", () => {
    const props = show();

    fireEvent.click(screen.getByRole("button", { name: "Find in document" }));
    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Close document" }));

    expect(props.onFind).toHaveBeenCalledOnce();
    expect(props.onNotes).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("says whether the notes are showing", () => {
    show({ notesOpen: false });

    expect(screen.getByRole("button", { name: "Notes" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("where the document is", () => {
  it("says which folders it is in, before its title", () => {
    show();

    expect(screen.getByText("CS454 / Week 3 /")).toBeDefined();
  });

  it("says nothing of folders for a document at the top of the vault", () => {
    show({ place: "" });

    expect(screen.queryByText(/CS454/u)).toBeNull();
  });
});
