// @vitest-environment jsdom
/**
 * Typing a page number.
 *
 * The reported bug is the first case: in scroll mode the page being shown is derived from
 * the scroll offset, so a field controlled by it discarded every keystroke. None of this
 * needs a layout engine — it is about when the field commits, not where anything lands.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageField } from "./PageField";

afterEach(cleanup);

function field(showing = 0, pages = 19) {
  const onGoTo = vi.fn<(index: number) => void>();

  render(<PageField onGoTo={onGoTo} pages={pages} showing={showing} />);

  const input = screen.getByRole("spinbutton");

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("the page field is not an input");
  }

  return { input, onGoTo };
}

describe("while typing", () => {
  it("keeps what was typed instead of snapping back", () => {
    // The reported bug. The field showed page 15 while the reader tried to type 1, so the
    // 1 vanished and the second digit could never be reached.
    const { input } = field(14);

    fireEvent.change(input, { target: { value: "1" } });

    expect(input.value).toBe("1");
  });

  it("moves the document as the number is typed", () => {
    // Requiring Enter was the first fix, and the report came back unchanged: nothing on
    // screen says a field needs Enter. The draft is what makes this safe -- the value no
    // longer comes from the page being shown, so a scroll that has not happened yet
    // cannot overwrite what was typed.
    // Starting from page 6, so that typing "1" is a real change. Starting from page 1
    // sets the field to the value it already holds, React fires no change event, and the
    // test passes or fails for a reason that has nothing to do with the code.
    const { input, onGoTo } = field(5);

    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "15" } });

    expect(onGoTo).toHaveBeenNthCalledWith(1, 0);
    expect(onGoTo).toHaveBeenNthCalledWith(2, 14);
  });

  it("waits before chasing a number that is still past the end", () => {
    // Otherwise "99" in a 19-page document drags the reader to the last page while they
    // are still typing. It is clamped once they are done, not while they are going.
    const { input, onGoTo } = field();

    fireEvent.change(input, { target: { value: "99" } });

    expect(onGoTo).not.toHaveBeenCalled();
  });
});

describe("committing", () => {
  it("goes to the typed page on Enter", () => {
    const { input, onGoTo } = field();

    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Zero-based inside the viewer, one-based on screen.
    expect(onGoTo).toHaveBeenCalledWith(14);
  });

  it("goes to the typed page on blur", () => {
    // Clicking back onto the document is a reasonable way to mean "yes, that one".
    const { input, onGoTo } = field();

    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input, { target: { value: "7" } });

    expect(onGoTo).toHaveBeenCalledWith(6);
  });

  it("clamps a page past the end rather than refusing it", () => {
    const { input, onGoTo } = field();

    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onGoTo).toHaveBeenCalledWith(18);
  });

  it("clamps a zero, which a document has no page for", () => {
    const { input, onGoTo } = field(5);

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onGoTo).toHaveBeenCalledWith(0);
  });

  it("reverts an empty field instead of going anywhere", () => {
    const { input, onGoTo } = field(5);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onGoTo).not.toHaveBeenCalled();
    expect(input.value).toBe("6");
  });
});

describe("abandoning", () => {
  it("goes back to where you were on Escape", () => {
    // The only reading of "abandon" that means anything once typing moves the document.
    // Dropping the text alone would leave the reader six pages from where they started.
    const { input, onGoTo } = field(5);

    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onGoTo).toHaveBeenLastCalledWith(5);
  });

  it("follows the document again once abandoned", () => {
    const { input } = field(5);

    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe("6");
  });
});

describe("when nobody is typing", () => {
  it("shows the page being read", () => {
    expect(field(8).input.value).toBe("9");
  });

  it("is empty and disabled for a document with no pages", () => {
    const { input } = field(0, 0);

    expect(input.value).toBe("");
    expect(input.disabled).toBe(true);
  });
});
