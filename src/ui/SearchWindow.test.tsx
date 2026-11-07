// @vitest-environment jsdom
/**
 * The ⌘P window: what it lists, how the keyboard moves through it, and how it closes.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { VaultSearch } from "../ipc/search";
import type { LectureRow } from "../ipc/vault";
import { SearchWindow } from "./SearchWindow";

afterEach(cleanup);

// jsdom lays nothing out, so it has no `scrollIntoView`; keeping the chosen result in view
// is a browser's job, checked by the search journey in WebKit.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function item(directory: string, title: string): LectureRow {
  return {
    directory,
    kind: "document",
    title,
    number: null,
    numberInTitle: null,
    sequence: "a0",
    course: null,
    module: null,
    week: null,
    tags: [],
    conversion: "notRequired",
    documentReady: true,
  };
}

const LISTING = { folders: ["CS454"], lectures: [item("CS454/raft", "Raft consensus"), item("CS454/paxos", "Paxos")] };

const FOUND: VaultSearch = {
  lectures: [
    {
      directory: "CS454/paxos",
      notes: [{ line: 3, snippet: { before: "every ", matched: "raft", after: " log" } }],
      noteLines: 1,
      marks: [],
    },
  ],
  unreadable: 0,
  truncated: false,
};

function open(query: string, found: VaultSearch | null = FOUND) {
  const props = { listing: LISTING, query, onQuery: vi.fn(), found, failure: null, onChoose: vi.fn(), onClose: vi.fn() };

  render(<SearchWindow {...props} />);

  return props;
}

const field = () => screen.getByRole("combobox");

describe("the search window", () => {
  it("lists names first, then lines of notes, each saying where it is", () => {
    open("raft");

    const options = screen.getAllByRole("option");

    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("Raft consensus"),
      expect.stringContaining("Paxos · line 3"),
    ]);
    expect(options[1]?.textContent).toContain("every raft log");
    expect(options[0]?.textContent).toContain("CS454");
  });

  it("puts the cursor in the field, and says what to type before anything is", () => {
    open("");

    expect(document.activeElement).toBe(field());
    expect(screen.getByText(/Type to search names, notes and highlights/u)).not.toBeNull();
  });

  it("moves with the arrow keys and opens the chosen one with Enter", () => {
    const props = open("raft");

    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");
    expect(field().getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1]?.id);

    // Never past the last.
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(props.onChoose).toHaveBeenCalledWith(expect.objectContaining({ group: "notes", detail: "line 3" }));
  });

  it("opens a result that is clicked", () => {
    const props = open("raft");

    fireEvent.click(screen.getAllByRole("option")[0] ?? document.body);

    expect(props.onChoose).toHaveBeenCalledWith(expect.objectContaining({ title: "Raft consensus" }));
  });

  it("closes on Escape and on a click outside it", () => {
    const props = open("raft");

    fireEvent.keyDown(field(), { key: "Escape" });
    fireEvent.mouseDown(document.querySelector(".search-scrim") ?? document.body);

    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("says what was searched for when nothing matches", () => {
    open("thermodynamics", { lectures: [], unreadable: 0, truncated: false });

    expect(screen.getByText("Nothing matches “thermodynamics”.")).not.toBeNull();
  });

  it("passes typing up, so the shell holds the query", () => {
    const props = open("ra");

    fireEvent.change(field(), { target: { value: "raft" } });

    expect(props.onQuery).toHaveBeenCalledWith("raft");
  });
});
