/**
 * The paste payload's two halves: the ASCII-only header, and the outcome Rust sends back.
 */
import { describe, expect, it } from "vitest";

import { AssetSaveSchema, asciiJson } from "./assets";

describe("the lecture header", () => {
  it("holds only ASCII, whatever the vault is called", () => {
    expect(asciiJson({ vault: "/Users/me/Études", directory: "réseaux/📌" })).toMatch(/^[\x00-\x7f]*$/);
  });

  it("parses back to the same names", () => {
    const names = { vault: "/Users/me/Études", directory: "week-2/réseaux" };

    expect(JSON.parse(asciiJson(names))).toEqual(names);
  });

  it("writes the escapes Rust's test reads", () => {
    // `crates/src-tauri/tests/assets.rs` parses exactly this.
    expect(asciiJson({ vault: "/Users/me/Études" })).toBe('{"vault":"/Users/me/\\u00c9tudes"}');
  });
});

describe("what Rust sends back", () => {
  it("parses a kept image and a refusal, as `lecture-fs` serialises them", () => {
    expect(AssetSaveSchema.parse({ outcome: "saved", path: "assets/a.png" }).outcome).toBe("saved");
    expect(AssetSaveSchema.parse({ outcome: "refused", reason: "notAnImage" }).outcome).toBe("refused");
  });

  it("refuses a reason it does not know", () => {
    expect(AssetSaveSchema.safeParse({ outcome: "refused", reason: "cursed" }).success).toBe(false);
  });
});
