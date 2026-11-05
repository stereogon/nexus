/**
 * The other half of a contract pair: `fixtures/notes.json` is written by
 * `crates/src-tauri/tests/notes_contract.rs` from the real commands, and these schemas
 * must accept exactly those bytes.
 */
import { describe, expect, it } from "vitest";

import notesFixture from "../../fixtures/notes.json";
import { NotesSaveSchema, NotesSchema } from "./notes";

describe("what Rust sends", () => {
  it("parses the notes of a lecture that has none yet", () => {
    expect(NotesSchema.parse(notesFixture.empty)).toEqual({
      text: "",
      version: notesFixture.empty.version,
    });
  });

  it("parses loaded notes", () => {
    expect(NotesSchema.parse(notesFixture.loaded).text).toBe("# Week 2\n");
  });

  it("parses a save", () => {
    const saved = NotesSaveSchema.parse(notesFixture.saved);

    expect(saved.outcome).toBe("saved");
  });

  it("parses a conflict, carrying what the file holds now", () => {
    const conflict = NotesSaveSchema.parse(notesFixture.conflict);

    expect(conflict.outcome === "conflict" && conflict.onDisk.text).toBe("# Week 2\n");
  });

  it("gives a saved file the same version as reading it back", () => {
    // So the next save is based on what was just written without a second read.
    const saved = NotesSaveSchema.parse(notesFixture.saved);

    expect(saved.outcome === "saved" && saved.version).toBe(notesFixture.loaded.version);
  });
});

describe("what it refuses", () => {
  it("refuses an outcome it does not know", () => {
    expect(NotesSaveSchema.safeParse({ outcome: "merged", version: "x" }).success).toBe(false);
  });

  it("refuses notes without a version, which a save could not be based on", () => {
    expect(NotesSchema.safeParse({ text: "hi", version: "" }).success).toBe(false);
  });
});
