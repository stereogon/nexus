// @vitest-environment jsdom
/**
 * The sidebar's behaviour — what it renders, what it disables, what it calls.
 *
 * # What these tests can and cannot see
 *
 * jsdom has no layout engine and applies no stylesheet. `getBoundingClientRect` returns
 * zeros, so nothing here can see a width, an overflow or a centring mistake — which is to
 * say, none of the defects found on 2026-10-29 by looking at the window would be caught by
 * a file like this one. `styles.test.ts` covers the "class name defined nowhere" half, and
 * real layout needs the browser suite in Milestone 5.
 *
 * What it does see is everything between the props and the DOM: which rows appear, in what
 * order, what is disabled, what each control calls, and what assistive technology is told.
 * That is a different class of bug, and until now it was entirely unguarded.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConversionState, LectureRow } from "../ipc/vault";
import { Sidebar } from "./Sidebar";
import { sidebarRows } from "./sidebarRows";

afterEach(cleanup);

function lecture(over: Partial<LectureRow> & { directory: string }): LectureRow {
  return {
    title: "Raft Consensus",
    sequence: "a0",
    course: null,
    module: null,
    week: null,
    tags: [],
    conversion: "ready" satisfies ConversionState,
    documentReady: true,
    ...over,
  };
}

function show(lectures: readonly LectureRow[], over: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    rows: sidebarRows(lectures, "folder", "none", ""),
    root: "/Users/me/NexusVault",
    groupBy: "folder" as const,
    thenBy: "none" as const,
    query: "",
    busy: false,
    openDirectory: null,
    skipped: [],
    unloadable: [],
    onGroupBy: vi.fn(),
    onThenBy: vi.fn(),
    onQuery: vi.fn(),
    onOpen: vi.fn(),
    onEdit: vi.fn(),
    hits: null,
    ...over,
  };

  render(<Sidebar {...props} />);

  return props;
}

describe("what the sidebar shows", () => {
  it("lists a lecture under its folder", () => {
    show([lecture({ directory: "CS454/Week 03/01-raft", title: "Raft" })]);

    expect(screen.getByText("CS454")).toBeDefined();
    expect(screen.getByText("Week 03")).toBeDefined();
    expect(screen.getByRole("button", { name: "Raft" })).toBeDefined();
  });

  it("says the vault is empty rather than showing nothing at all", () => {
    show([]);

    expect(screen.getByText(/Drop a PDF/u)).toBeDefined();
  });

  it("says what was searched for when nothing matches", () => {
    // A different message from an empty vault: one means "add something", the other means
    // "try different words", and showing the first for the second is misleading.
    show([lecture({ directory: "a" })], {
      rows: [],
      query: "thermodynamics",
    });

    expect(screen.getByText(/thermodynamics/u)).toBeDefined();
  });

  it("shortens the vault path and keeps the whole one available", () => {
    show([]);

    const path = screen.getByTitle("/Users/me/NexusVault");

    expect(path.textContent).toBe("…/me/NexusVault");
  });

  it("shows folders the walk skipped, which have no artboard but must not vanish", () => {
    show([], {
      skipped: [{ directory: "odd", remediation: "That folder has no manifest." }],
    });

    expect(screen.getByText("That folder has no manifest.")).toBeDefined();
  });
});

describe("what the sidebar refuses", () => {
  it("will not open a lecture whose PDF is not ready", () => {
    show([
      lecture({ directory: "a", title: "Waiting", documentReady: false, conversion: "queued" }),
    ]);

    // Named "Waiting, Queued": the state is part of the name, so a screen reader is told
    // why the control is disabled instead of meeting a dead button.
    expect(
      screen.getByRole("button", { name: "Waiting, Queued" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("explains why, rather than just being dead", () => {
    show([lecture({ directory: "a", title: "Waiting", documentReady: false })]);

    expect(screen.getByRole("button", { name: "Waiting" }).title).toMatch(/no PDF yet/u);

    // And the number is not read out: it is the folder's prefix, the rows are already in
    // that order, and announcing it on every row is noise.
    expect(screen.queryByRole("button", { name: /01/u })).toBeNull();
  });

  it("disables everything while the vault is busy", () => {
    show([lecture({ directory: "a", title: "Raft" })], { busy: true });

    expect(screen.getByRole("button", { name: "Raft" }).hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Edit Raft" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("what the sidebar calls", () => {
  it("opens the lecture that was clicked, not the first one", () => {
    const wanted = lecture({ directory: "b", title: "Second", sequence: "a1" });
    const props = show([lecture({ directory: "a", title: "First" }), wanted]);

    fireEvent.click(screen.getByRole("button", { name: "Second" }));

    expect(props.onOpen).toHaveBeenCalledWith(wanted);
  });

  it("edits from the row's own control", () => {
    const only = lecture({ directory: "a", title: "Raft" });
    const props = show([only]);

    fireEvent.click(screen.getByRole("button", { name: "Edit Raft" }));

    expect(props.onEdit).toHaveBeenCalledWith(only);
  });

  it("reports a change of grouping", () => {
    const props = show([]);

    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    expect(props.onGroupBy).toHaveBeenCalledWith("week");
  });

  it("reports typing, letting the shell hold the query", () => {
    const props = show([]);

    fireEvent.change(screen.getByLabelText("Search vault"), {
      target: { value: "raft" },
    });

    expect(props.onQuery).toHaveBeenCalledWith("raft");
  });
});

describe("what the sidebar tells assistive technology", () => {
  it("marks the chosen grouping as pressed, and only that one", () => {
    show([], { groupBy: "tag" });

    expect(screen.getByRole("button", { name: "Tag" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Folder" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("gives the search field a label, since its placeholder is not one", () => {
    show([]);

    expect(screen.getByLabelText("Search vault")).toBeDefined();
  });

  it("names each edit control by the lecture it edits", () => {
    // "Edit" three times over tells a screen-reader user nothing about which is which.
    show([
      lecture({ directory: "a", title: "Raft" }),
      lecture({ directory: "b", title: "Paxos", sequence: "a1" }),
    ]);

    expect(screen.getByRole("button", { name: "Edit Raft" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Edit Paxos" })).toBeDefined();
  });

  it("marks the lecture being read", () => {
    show([lecture({ directory: "CS454/01-raft", title: "Raft" })], {
      openDirectory: "CS454/01-raft",
    });

    const row = screen.getByRole("button", { name: "Raft" }).closest(".lecture-row");

    expect(row?.getAttribute("data-open")).toBe("true");
  });
});
