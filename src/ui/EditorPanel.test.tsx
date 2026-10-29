// @vitest-environment jsdom
/**
 * The editor panel: what it says, how it closes, and where it leaves focus.
 *
 * Where it *sits* is not testable here — jsdom has no layout engine, so the claim that it
 * appears beside the viewer rather than over it is one only a browser can check.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LectureRow } from "../ipc/vault";
import { EditorPanel } from "./EditorPanel";

afterEach(cleanup);

const LECTURE: LectureRow = {
  directory: "week-2/process-overview",
  title: "2. ProcessOverview",
  sequence: "a0",
  course: "Software Systems Engineering",
  module: "Requirement Engineering",
  week: "Week 2",
  tags: ["exam"],
  conversion: "notRequired",
  documentReady: true,
};

/** A field by its label, narrowed rather than asserted so a wrong element fails loudly. */
function field(label: string): HTMLInputElement {
  const found = screen.getByLabelText(label);

  if (!(found instanceof HTMLInputElement)) {
    throw new Error(`"${label}" is not a text field`);
  }

  return found;
}

function panel() {
  const onCancel = vi.fn();
  const rendered = render(
    <EditorPanel busy={false} lecture={LECTURE} onCancel={onCancel} onSave={vi.fn()} />,
  );

  return { onCancel, unmount: rendered.unmount };
}

/** A button outside the panel, standing in for the sidebar's Edit control. */
function trigger(): HTMLButtonElement {
  const button = document.createElement("button");

  document.body.append(button);
  button.focus();

  return button;
}

describe("what it says", () => {
  it("names the lecture being edited", () => {
    // With a document open the lecture in the panel is often not the one on screen, so it
    // says which one rather than leaving it to be inferred from the sidebar.
    panel();

    expect(screen.getByText("2. ProcessOverview")).not.toBeNull();
  });

  it("is labelled by its heading rather than announced as a dialog", () => {
    // Not a modal: the document stays readable and selectable beside it, which is the
    // whole reason it is a panel. Announcing a dialog would promise a focus trap that is
    // deliberately not there.
    panel();

    expect(screen.getByRole("complementary", { name: "Edit lecture" })).not.toBeNull();
  });

  it("carries the lecture's current values into the form", () => {
    panel();

    expect(field("Week").value).toBe("Week 2");
    expect(field("Tags").value).toBe("exam");
  });
});

describe("closing it", () => {
  it("closes on Escape", () => {
    const { onCancel } = panel();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("closes from the header button", () => {
    const { onCancel } = panel();

    fireEvent.click(screen.getByRole("button", { name: "Close the editor" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("focus", () => {
  it("moves into the form when the panel opens", () => {
    // The panel appears far from the control that opened it. Leaving focus behind means
    // tabbing across the whole window to reach a form you have just asked for.
    const opened = trigger();

    panel();

    expect(document.activeElement).toBe(field("Title"));
    opened.remove();
  });

  it("goes back where it came from when the panel closes", () => {
    const opened = trigger();
    const { unmount } = panel();

    unmount();

    expect(document.activeElement).toBe(opened);
    opened.remove();
  });
});
