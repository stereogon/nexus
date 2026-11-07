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
import { sidebarRows, type Listing } from "./sidebarRows";
import type { ThemeName } from "./themes";

afterEach(cleanup);

function lecture(over: Partial<LectureRow> & { directory: string }): LectureRow {
  return {
    kind: "document",
    title: "Raft Consensus",
    number: null,
    numberInTitle: null,
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

/** The foot's controls, each a fresh spy. */
function footing(theme: ThemeName = "system") {
  return {
    libraryShown: false,
    onToggleLibrary: vi.fn(),
    errorsShown: false,
    onToggleErrors: vi.fn(),
    theme,
    onChooseTheme: vi.fn(),
  };
}

function show(
  listing: Listing,
  over: Partial<Parameters<typeof Sidebar>[0]> = {},
) {
  const folder = over.folder ?? "";
  const query = over.query ?? "";
  const props = {
    rows: sidebarRows(listing, folder, query),
    root: "/Users/me/NexusVault",
    folder,
    query,
    busy: false,
    openDirectory: null,
    skipped: [],
    unloadable: [],
    onFolder: vi.fn(),
    onQuery: vi.fn(),
    onOpen: vi.fn(),
    onEdit: vi.fn(),
    onMake: vi.fn(),
    onImport: vi.fn(),
    onHide: vi.fn(),
    onChooseVault: vi.fn(),
    foot: footing(),
    hits: null,
    ...over,
  };

  render(<Sidebar {...props} />);

  return props;
}

const VAULT: Listing = {
  folders: ["CS454", "CS454/Week 3"],
  lectures: [
    lecture({ directory: "CS454/Week 3/raft", title: "Raft" }),
    lecture({ directory: "loose", title: "Loose notes", kind: "note", documentReady: false }),
  ],
};

describe("what the sidebar shows", () => {
  it("shows only what is in the folder showing", () => {
    show(VAULT);

    expect(screen.getByRole("button", { name: "Folder CS454" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Loose notes" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Raft" })).toBeNull();
  });

  it("names where it is: the vault, then each folder down", () => {
    show(VAULT, { folder: "CS454/Week 3" });

    const crumbs = screen.getByRole("navigation", { name: "Folder" });

    expect(crumbs.textContent).toContain("NexusVault");
    expect(screen.getByRole("button", { name: "Week 3" }).getAttribute("aria-current")).toBe("location");
    expect(screen.getByRole("button", { name: "Raft" })).not.toBeNull();
  });

  it("says a folder is empty, and how to fill it", () => {
    show({ folders: ["Empty"], lectures: [] }, { folder: "Empty" });

    expect(screen.getByText(/Nothing here yet/)).not.toBeNull();
  });

  it("says what was searched for when nothing matches", () => {
    show(VAULT, { query: "thermodynamics" });

    expect(screen.getByText("Nothing matches “thermodynamics”.")).not.toBeNull();
  });

  it("searches the whole vault, and says where each result is", () => {
    show(VAULT, { query: "raft" });

    expect(screen.getByRole("button", { name: "Raft, in CS454 / Week 3" })).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "Folder" })).toBeNull();
  });

  it("shortens the vault path and keeps the whole one available", () => {
    show(VAULT);

    expect(screen.getByTitle("/Users/me/NexusVault").textContent).toBe("…/me/NexusVault");
  });

  it("shows folders the walk skipped, which must not vanish", () => {
    show(VAULT, { skipped: [{ directory: "bad:name", remediation: "Rename this folder." }] });

    expect(screen.getByText("Rename this folder.")).not.toBeNull();
  });
});

describe("what the sidebar refuses", () => {
  it("will not open a document whose PDF is not ready, and says why", () => {
    show({ folders: [], lectures: [lecture({ directory: "waiting", title: "Waiting", conversion: "queued", documentReady: false })] });

    const row = screen.getByRole("button", { name: "Waiting, Queued" });

    expect(row).toHaveProperty("disabled", true);
    expect(row.getAttribute("title")).toContain("no PDF yet");
  });

  it("opens a note, which has no document to wait for", () => {
    const props = show(VAULT);

    fireEvent.click(screen.getByRole("button", { name: "Loose notes" }));

    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ directory: "loose" }));
  });

  it("disables everything while the vault is busy", () => {
    show(VAULT, { busy: true });

    for (const name of ["Folder CS454", "Loose notes", "New note, folder or import"]) {
      expect(screen.getByRole("button", { name })).toHaveProperty("disabled", true);
    }
  });
});

describe("what the sidebar calls", () => {
  it("steps into a folder, and back out to the one above", () => {
    const props = show(VAULT, { folder: "CS454" });

    fireEvent.click(screen.getByRole("button", { name: "Folder Week 3" }));
    expect(props.onFolder).toHaveBeenLastCalledWith("CS454/Week 3");

    fireEvent.click(screen.getByRole("button", { name: "Back to the folder above" }));
    expect(props.onFolder).toHaveBeenLastCalledWith("");
  });

  it("cannot go back from the top of the vault", () => {
    show(VAULT);

    expect(screen.getByRole("button", { name: "Back to the folder above" })).toHaveProperty("disabled", true);
  });

  it("makes a note with the name typed, and nothing for a blank one", () => {
    const props = show(VAULT);

    fireEvent.click(screen.getByRole("button", { name: "New note, folder or import" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Note" }));
    fireEvent.submit(screen.getByLabelText("Name of the new note"));
    expect(props.onMake).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "New note, folder or import" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Name of the new note"), { target: { value: "  Plans  " } });
    fireEvent.submit(screen.getByLabelText("Name of the new note"));
    expect(props.onMake).toHaveBeenCalledWith("note", "Plans");
  });

  it("forgets a new folder's name on Escape", () => {
    const props = show(VAULT);

    fireEvent.click(screen.getByRole("button", { name: "New note, folder or import" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Folder" }));
    fireEvent.change(screen.getByLabelText("Name of the new folder"), { target: { value: "Week 4" } });
    fireEvent.keyDown(screen.getByLabelText("Name of the new folder"), { key: "Escape" });

    expect(screen.queryByLabelText("Name of the new folder")).toBeNull();
    expect(props.onMake).not.toHaveBeenCalled();
  });

  it("imports into the folder showing, from the + menu, which says where things go", () => {
    const props = show(VAULT);

    fireEvent.click(screen.getByRole("button", { name: "New note, folder or import" }));
    expect(screen.getByText("Added to the folder showing")).not.toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: /Import document/u }));

    expect(props.onImport).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu", { name: "New" })).toBeNull();
  });

  it("opens another vault from the vault's name", () => {
    const props = show(VAULT);

    fireEvent.click(screen.getByRole("button", { name: "Vault: NexusVault" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open another vault…" }));

    expect(props.onChooseVault).toHaveBeenCalledOnce();
  });

  it("hides itself from its own control", () => {
    const props = show(VAULT);

    fireEvent.click(screen.getByRole("button", { name: "Hide sidebar" }));

    expect(props.onHide).toHaveBeenCalledOnce();
  });

  it("opens the theme picker from the foot, with the current theme checked, and chooses from it", () => {
    const props = show(VAULT, { foot: footing("neon") });

    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    expect(screen.getByRole("menuitemradio", { name: /Neon/u }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(16);

    fireEvent.click(screen.getByRole("menuitemradio", { name: /Sepia/u }));
    expect(props.foot.onChooseTheme).toHaveBeenCalledWith("sepia");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Theme" })).toBeNull();
  });

  it("opens the library and the error panel from the foot", () => {
    const props = show(VAULT);

    fireEvent.click(screen.getByRole("button", { name: "Highlights library" }));
    fireEvent.click(screen.getByRole("button", { name: "Errors" }));

    expect(props.foot.onToggleLibrary).toHaveBeenCalledOnce();
    expect(props.foot.onToggleErrors).toHaveBeenCalledOnce();
  });

  it("edits from the row's own control", () => {
    const props = show(VAULT);

    fireEvent.click(screen.getByRole("button", { name: "Edit Loose notes" }));

    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ directory: "loose" }));
  });

  it("reports typing, letting the shell hold the query", () => {
    const props = show(VAULT);

    fireEvent.change(screen.getByLabelText("Search vault"), { target: { value: "raft" } });

    expect(props.onQuery).toHaveBeenCalledWith("raft");
  });
});

describe("what the sidebar tells assistive technology", () => {
  it("gives the search field a label, since its placeholder is not one", () => {
    show(VAULT);

    expect(screen.getByLabelText("Search vault")).not.toBeNull();
  });

  it("marks the item being read", () => {
    show(VAULT, { openDirectory: "loose" });

    expect(screen.getByRole("button", { name: "Loose notes" }).closest(".lecture-row")?.getAttribute("data-open")).toBe("true");
  });
});
