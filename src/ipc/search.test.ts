/**
 * The other half of a contract pair: `fixtures/search.json` is written by
 * `crates/src-tauri/tests/search_contract.rs` from the real commands, and these schemas
 * must accept exactly those bytes.
 */
import { describe, expect, it } from "vitest";

import searchFixture from "../../fixtures/search.json";
import { VaultMarksSchema, VaultSearchSchema } from "./search";

describe("what Rust sends", () => {
  it("parses a search, with matches in notes and in highlights", () => {
    const found = VaultSearchSchema.parse(searchFixture.search);
    const [raft] = found.lectures;

    expect(raft?.notes[0]?.line).toBe(3);
    expect(raft?.marks[0]?.semantic).toBe("exam");
    expect(found.unreadable).toBe(1);
  });

  it("parses a snippet whose pieces join back into the text", () => {
    const snippet = VaultSearchSchema.parse(searchFixture.search).lectures[0]?.notes[0]?.snippet;

    expect(`${snippet?.before ?? ""}${snippet?.matched ?? ""}${snippet?.after ?? ""}`).toBe("A leader is elected.");
  });

  it("parses the highlights library", () => {
    const library = VaultMarksSchema.parse(searchFixture.highlights);

    expect(library.lectures[0]?.annotations[0]?.id).toBe("hl-1");
    expect(library.unreadable).toBe(1);
  });
});
