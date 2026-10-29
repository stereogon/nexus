// @vitest-environment jsdom
/**
 * What the screening tells the reader.
 *
 * The rule being checked is the judgement in the component: a notable finding is expanded
 * on arrival, an informational one is folded away. Getting that backwards means either a
 * wall of text over a harmless deck, or a document that wants to launch a program being
 * one click from unnoticed.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { DocumentRisk } from "../ipc/document";
import { DocumentNotice } from "./DocumentNotice";

afterEach(cleanup);

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
    const { container } = render(
      <DocumentNotice needsAttention={false} risks={[]} />,
    );

    expect(container.textContent).toBe("");
  });
});

describe("a notable finding", () => {
  it("is open on arrival", () => {
    render(<DocumentNotice needsAttention risks={[LAUNCH]} />);

    expect(screen.getByText(LAUNCH.explanation)).toBeDefined();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  });

  it("can be folded away once read", () => {
    render(<DocumentNotice needsAttention risks={[LAUNCH]} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.queryByText(LAUNCH.explanation)).toBeNull();
  });
});

describe("an informational finding", () => {
  it("is folded away, with a summary that still says something is there", () => {
    render(<DocumentNotice needsAttention={false} risks={[LINK]} />);

    expect(screen.queryByText(LINK.explanation)).toBeNull();
    expect(screen.getByText(/1 thing Nexus does not do/u)).toBeDefined();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  it("opens when asked", () => {
    render(<DocumentNotice needsAttention={false} risks={[LINK]} />);

    fireEvent.click(screen.getByRole("button", { name: "What it asks for" }));

    expect(screen.getByText(LINK.explanation)).toBeDefined();
  });
});

describe("the summary line", () => {
  it("counts in singular and plural", () => {
    render(<DocumentNotice needsAttention={false} risks={[LINK]} />);
    expect(screen.getByText("This document asks for 1 thing Nexus does not do.")).toBeDefined();

    cleanup();

    render(<DocumentNotice needsAttention risks={[LAUNCH, LINK]} />);
    expect(
      screen.getByText("This document asks for 2 things Nexus does not do."),
    ).toBeDefined();
  });

  it("lists every finding, with its code", () => {
    render(<DocumentNotice needsAttention risks={[LAUNCH, LINK]} />);

    expect(screen.getByText("LAUNCHES_A_PROGRAM")).toBeDefined();
    expect(screen.getByText("EXTERNAL_LINK")).toBeDefined();
  });
});
