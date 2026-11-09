// @vitest-environment jsdom
/**
 * What the screening tells the reader.
 *
 * The rule being checked is the judgement in the component: a notable finding is expanded
 * on arrival, an informational one is folded away. Getting that backwards means either a
 * wall of text over a harmless deck, or a document that wants to launch a program being
 * one click from unnoticed.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentRisk } from "../ipc/document";
import { noticeQuiet, quietNotice } from "../ipc/notice";
import { DocumentNotice } from "./DocumentNotice";

vi.mock("../ipc/notice", () => ({ noticeQuiet: vi.fn(), quietNotice: vi.fn() }));

beforeEach(() => {
  vi.mocked(noticeQuiet).mockResolvedValue(false);
  vi.mocked(quietNotice).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** The notice for a document in `/vault`, once it knows whether it was silenced. */
async function shown(risks: readonly DocumentRisk[], needsAttention: boolean) {
  const view = render(<DocumentNotice directory="Deck" needsAttention={needsAttention} risks={risks} vault="/vault" />);

  await screen.findByText(/Nexus does not do/u);
  return view;
}

const LINK: DocumentRisk = {
  code: "EXTERNAL_LINK",
  severity: "informational",
  explanation: "It links to the web. Nexus does not open links.",
};

const LAUNCH: DocumentRisk = {
  code: "LAUNCHES_A_PROGRAM",
  severity: "notable",
  explanation: "It asks to run a program. Nexus never runs one.",
};

describe("a document with nothing to report", () => {
  it("shows nothing at all, rather than an empty reassurance", () => {
    // An all-clear on every document trains people to ignore the strip, which is exactly
    // the strip that matters on the one document that is not clear.
    const { container } = render(<DocumentNotice directory="Deck" needsAttention={false} risks={[]} vault="/vault" />);

    expect(container.textContent).toBe("");
  });
});

describe("a notable finding", () => {
  it("is open on arrival", async () => {
    await shown([LAUNCH], true);

    expect(screen.getByText(LAUNCH.explanation)).toBeDefined();
    expect(screen.getByRole("button", { expanded: true }).getAttribute("aria-expanded")).toBe("true");
  });

  it("can be folded away once read", async () => {
    await shown([LAUNCH], true);

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));

    expect(screen.queryByText(LAUNCH.explanation)).toBeNull();
  });
});

describe("an informational finding", () => {
  it("is folded away, with a summary that still says something is there", async () => {
    await shown([LINK], false);

    expect(screen.queryByText(LINK.explanation)).toBeNull();
    expect(screen.getByText(/1 thing Nexus does not do/u)).toBeDefined();
    expect(screen.getByRole("button", { name: "What it asks for" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("opens when asked", async () => {
    await shown([LINK], false);

    fireEvent.click(screen.getByRole("button", { name: "What it asks for" }));

    expect(screen.getByText(LINK.explanation)).toBeDefined();
  });
});

describe("the summary line", () => {
  it("counts in singular and plural", async () => {
    await shown([LINK], false);
    expect(screen.getByText("This document asks for 1 thing Nexus does not do.")).toBeDefined();

    cleanup();

    await shown([LAUNCH, LINK], true);
    expect(
      screen.getByText("This document asks for 2 things Nexus does not do."),
    ).toBeDefined();
  });

  it("lists every finding, with its code", async () => {
    await shown([LAUNCH, LINK], true);

    expect(screen.getByText("LAUNCHES_A_PROGRAM")).toBeDefined();
    expect(screen.getByText("EXTERNAL_LINK")).toBeDefined();
  });
});

describe("putting it away", () => {
  it("✕ hides it, and silences nothing for next time", async () => {
    await shown([LINK], false);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText(/Nexus does not do/u)).toBeNull();
    expect(quietNotice).not.toHaveBeenCalled();
  });

  it("Don't show again hides it and remembers that document", async () => {
    await shown([LAUNCH], true);

    fireEvent.click(screen.getByRole("button", { name: "Don't show again for this document" }));

    expect(screen.queryByText(/Nexus does not do/u)).toBeNull();
    expect(quietNotice).toHaveBeenCalledWith("/vault", "Deck");
  });

  it("a silenced document shows nothing — not even before the answer arrives", async () => {
    vi.mocked(noticeQuiet).mockResolvedValue(true);
    const { container } = render(<DocumentNotice directory="Deck" needsAttention risks={[LAUNCH]} vault="/vault" />);

    expect(container.textContent).toBe("");
    // Let the answer land and React apply it.
    await act(async () => {
      await Promise.resolve();
    });
    expect(noticeQuiet).toHaveBeenCalledWith("/vault", "Deck");
    expect(container.textContent).toBe("");
  });
});
