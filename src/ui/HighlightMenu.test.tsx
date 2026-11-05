// @vitest-environment jsdom
/**
 * The menu for marking a selection, and for an existing highlight.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HighlightMenu } from "./HighlightMenu";
import { SEMANTICS } from "./semantics";

afterEach(cleanup);

const AT = { left: 120, top: 340, above: 320 };

describe("marking a new selection", () => {
  it("offers every semantic, each with its letter", () => {
    render(
      <HighlightMenu at={AT} current={null} onChoose={vi.fn()} onDismiss={vi.fn()} onRemove={null} />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(SEMANTICS.length);
    expect(screen.getByRole("button", { name: "Key concept" }).textContent).toBe("K");
    expect(screen.getByRole("button", { name: "Exam / important" }).textContent).toBe("E");
  });

  it("reports the one chosen", () => {
    const onChoose = vi.fn();

    render(
      <HighlightMenu at={AT} current={null} onChoose={onChoose} onDismiss={vi.fn()} onRemove={null} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Question" }));

    expect(onChoose).toHaveBeenCalledWith("question");
  });

  it("offers no way to remove something that does not exist yet", () => {
    render(
      <HighlightMenu at={AT} current={null} onChoose={vi.fn()} onDismiss={vi.fn()} onRemove={null} />,
    );

    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("sits where it was told, in viewport coordinates", () => {
    const { container } = render(
      <HighlightMenu at={AT} current={null} onChoose={vi.fn()} onDismiss={vi.fn()} onRemove={null} />,
    );
    const style = container.querySelector(".highlight-menu")?.getAttribute("style");

    expect(style).toContain("left: 120px");
    expect(style).toContain("top: 340px");
  });
});

describe("an existing highlight", () => {
  it("can be removed", () => {
    const onRemove = vi.fn();

    render(
      <HighlightMenu at={AT} current={null} onChoose={null} onDismiss={vi.fn()} onRemove={onRemove} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemove).toHaveBeenCalled();
  });

  it("offers re-marking alongside Remove, keeping its id", () => {
    // Until 2026-11-05 this menu offered Remove alone: re-marking meant removing and
    // making a new highlight, which minted a new id and broke every `cite://` link to it.
    // `retag_annotation` keeps the id, so all four meanings are offered now.
    render(
      <HighlightMenu
        at={AT}
        current="key"
        onChoose={vi.fn()}
        onDismiss={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(SEMANTICS.length + 1);
    expect(screen.getByRole("button", { name: "Remove" })).not.toBeNull();
  });

  it("shows the meaning it already has as pressed, and only that one", () => {
    render(
      <HighlightMenu
        at={AT}
        current="exam"
        onChoose={vi.fn()}
        onDismiss={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const pressed = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") === "true");

    expect(pressed.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Exam / important",
    ]);
  });

  it("re-marks with the meaning chosen", () => {
    const onChoose = vi.fn<(semantic: string) => void>();

    render(
      <HighlightMenu
        at={AT}
        current="key"
        onChoose={onChoose}
        onDismiss={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Question" }));

    expect(onChoose).toHaveBeenCalledWith("question");
  });

  it("offers only Remove for something with no meaning to change", () => {
    // A text box. Nothing creates one yet, but the menu must not offer four colours for a
    // thing that cannot hold one.
    render(
      <HighlightMenu at={AT} current={null} onChoose={null} onDismiss={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("a fresh selection", () => {
  it("offers four actions rather than a choice already made", () => {
    // `aria-pressed="false"` on all four would announce a selected state that was never
    // on offer.
    render(
      <HighlightMenu at={AT} current={null} onChoose={vi.fn()} onDismiss={vi.fn()} onRemove={null} />,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button.hasAttribute("aria-pressed")).toBe(false);
    }
  });
});

describe("getting rid of it", () => {
  it("closes on Escape", () => {
    const onDismiss = vi.fn();

    render(
      <HighlightMenu at={AT} current={null} onChoose={vi.fn()} onDismiss={onDismiss} onRemove={null} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismiss).toHaveBeenCalled();
  });

  it("ignores other keys, so typing does not dismiss it", () => {
    const onDismiss = vi.fn();

    render(
      <HighlightMenu at={AT} current={null} onChoose={vi.fn()} onDismiss={onDismiss} onRemove={null} />,
    );
    fireEvent.keyDown(document, { key: "k" });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("stops listening once it is gone", () => {
    // A menu that kept its key listener after unmounting would answer for the next one.
    const onDismiss = vi.fn();
    const { unmount } = render(
      <HighlightMenu at={AT} current={null} onChoose={vi.fn()} onDismiss={onDismiss} onRemove={null} />,
    );

    unmount();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("is labelled as a group, so it is announced as one thing", () => {
    render(
      <HighlightMenu at={AT} current={null} onChoose={vi.fn()} onDismiss={vi.fn()} onRemove={null} />,
    );

    expect(screen.getByRole("group", { name: "Highlight as" })).toBeDefined();
  });
});
