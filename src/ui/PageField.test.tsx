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

  it("does not navigate on every keystroke", () => {
    // Page mode did, which is why typing "15" went to page 1 on the way past.
    const { input, onGoTo } = field();

    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "15" } });

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
  it("drops the draft on Escape and goes nowhere", () => {
    const { input, onGoTo } = field(5);

    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onGoTo).not.toHaveBeenCalled();
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
