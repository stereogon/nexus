// @vitest-environment jsdom
/**
 * The menu for marking a selection, and for an existing highlight.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HighlightMenu } from "./HighlightMenu";
import { SEMANTICS } from "./semantics";

afterEach(cleanup);

const AT = { left: 120, top: 340 };

describe("marking a new selection", () => {
  it("offers every semantic, each with its letter", () => {
    render(
      <HighlightMenu at={AT} onChoose={vi.fn()} onDismiss={vi.fn()} onRemove={null} />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(SEMANTICS.length);
    expect(screen.getByRole("button", { name: "Key concept" }).textContent).toBe("K");
    expect(screen.getByRole("button", { name: "Exam / important" }).textContent).toBe("E");
  });

  it("reports the one chosen", () => {
    const onChoose = vi.fn();

    render(
      <HighlightMenu at={AT} onChoose={onChoose} onDismiss={vi.fn()} onRemove={null} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Question" }));

    expect(onChoose).toHaveBeenCalledWith("question");
  });

  it("offers no way to remove something that does not exist yet", () => {
    render(
      <HighlightMenu at={AT} onChoose={vi.fn()} onDismiss={vi.fn()} onRemove={null} />,
    );

    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("sits where it was told, in viewport coordinates", () => {
    const { container } = render(
      <HighlightMenu at={AT} onChoose={vi.fn()} onDismiss={vi.fn()} onRemove={null} />,
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
      <HighlightMenu at={AT} onChoose={null} onDismiss={vi.fn()} onRemove={onRemove} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemove).toHaveBeenCalled();
  });

  it("offers no re-tagging, which would mint a new id and break a citation", () => {
    // `cite://<id>` in the notes points at this annotation. Remove-and-add would change
    // the id silently, so until there is a command that edits in place, the menu does not
    // pretend to offer it.
    render(
      <HighlightMenu at={AT} onChoose={null} onDismiss={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "Key concept" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("getting rid of it", () => {
  it("closes on Escape", () => {
    const onDismiss = vi.fn();

    render(
      <HighlightMenu at={AT} onChoose={vi.fn()} onDismiss={onDismiss} onRemove={null} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismiss).toHaveBeenCalled();
  });

  it("ignores other keys, so typing does not dismiss it", () => {
    const onDismiss = vi.fn();

    render(
      <HighlightMenu at={AT} onChoose={vi.fn()} onDismiss={onDismiss} onRemove={null} />,
    );
    fireEvent.keyDown(document, { key: "k" });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("stops listening once it is gone", () => {
    // A menu that kept its key listener after unmounting would answer for the next one.
    const onDismiss = vi.fn();
    const { unmount } = render(
      <HighlightMenu at={AT} onChoose={vi.fn()} onDismiss={onDismiss} onRemove={null} />,
    );

    unmount();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("is labelled as a group, so it is announced as one thing", () => {
    render(
      <HighlightMenu at={AT} onChoose={vi.fn()} onDismiss={vi.fn()} onRemove={null} />,
    );

    expect(screen.getByRole("group", { name: "Highlight as" })).toBeDefined();
  });
});
