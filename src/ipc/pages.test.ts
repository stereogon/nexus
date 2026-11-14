/**
 * The other half of a contract pair: `fixtures/pages.json` is written by
 * `crates/src-tauri/tests/pages.rs` from the real store, and these schemas must accept
 * exactly those bytes.
 */
import { describe, expect, it } from "vitest";

import pagesFixture from "../../fixtures/pages.json";
import { NotesSaveSchema, NotesSchema } from "./notes";
import { PagesListingSchema } from "./pages";

describe("what Rust sends for pages", () => {
  it("parses a listing, with a page inside another and one that could not be read", () => {
    const listing = PagesListingSchema.parse(pagesFixture.listing);

    expect(listing.pages.map((page) => [page.id, page.parent])).toEqual([
      ["pg-1", null],
      ["pg-2", "pg-1"],
    ]);
    expect(listing.pages[0]?.cites).toEqual(["hl-1"]);
    expect(listing.unreadable).toBe(1);
  });

  it("parses a page opened and saved as notes are", () => {
    expect(NotesSchema.parse(pagesFixture.opened).text).toBe("");
    expect(NotesSaveSchema.parse(pagesFixture.saved).outcome).toBe("saved");
  });
});
