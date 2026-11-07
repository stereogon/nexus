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
  kind: "document",
  title: "2. ProcessOverview",
  number: null,
  numberInTitle: null,
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
  const onSave = vi.fn();
  const rendered = render(
    <EditorPanel
      busy={false}
      folders={["week-1", "week-2"]}
      lecture={LECTURE}
      onCancel={onCancel}
      onSave={onSave}
      vaultName="StudyVault"
    />,
  );

  return { onCancel, onSave, unmount: rendered.unmount };
}

/** A button outside the panel, standing in for the sidebar's Edit control. */
function trigger(): HTMLButtonElement {
  const button = document.createElement("button");

  document.body.append(button);
  button.focus();

  return button;
}

describe("what it says", () => {
  it("names the item being edited", () => {
    // With a document open the item in the panel is often not the one on screen, so it
    // says which one rather than leaving it to be inferred from the sidebar.
    panel();

    expect(screen.getByText("2. ProcessOverview")).not.toBeNull();
  });

  it("is labelled by its heading rather than announced as a dialog", () => {
    // Not a modal: the document stays readable and selectable beside it, which is the
    // whole reason it is a panel. Announcing a dialog would promise a focus trap that is
    // deliberately not there.
    panel();

    expect(screen.getByRole("complementary", { name: "Edit document" })).not.toBeNull();
  });

  it("carries the item's current values into the form, with the folder it is in", () => {
    panel();

    expect(field("Tags").value).toBe("exam");
    expect(screen.getByLabelText<HTMLSelectElement>("Folder").value).toBe("week-2");
  });

  it("asks for no course, module or week, and sends back the ones already saved", () => {
    // The folder says where an item belongs now; the values an older file holds are kept
    // rather than cleared by an edit that never showed them.
    const { onSave } = panel();

    expect(screen.queryByLabelText("Course")).toBeNull();
    expect(screen.queryByLabelText("Week")).toBeNull();

    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "week-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ course: "Software Systems Engineering", week: "Week 2" }),
      "week-1",
    );
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
