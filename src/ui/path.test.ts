import { describe, expect, it } from "vitest";

import { shortPath } from "./path";

describe("the vault path in the sidebar's footer", () => {
  it("keeps the end, which is the part that identifies the vault", () => {
    expect(shortPath("/Users/alex/Developer/NexusVault")).toBe(
      "…/Developer/NexusVault",
    );
  });

  it("leaves a short path alone", () => {
    expect(shortPath("/Users/me")).toBe("/Users/me");
    expect(shortPath("/vault")).toBe("/vault");
  });

  it("does not move the leading slash to the end", () => {
    // What `direction: rtl` did, and the reason this is a string operation instead:
    // `/Users/me/NexusVault` was drawn as `Users/me/NexusVault/`.
    const shown = shortPath("/Users/me/NexusVault");

    expect(shown.endsWith("/")).toBe(false);
    expect(shown).toBe("…/me/NexusVault");
  });

  it("handles a trailing slash without producing an empty segment", () => {
    expect(shortPath("/Users/me/NexusVault/")).toBe("…/me/NexusVault");
  });

  it("can be asked for more of the path", () => {
    expect(shortPath("/a/b/c/d", 3)).toBe("…/b/c/d");
  });

  it("returns something for an empty path rather than throwing", () => {
    expect(shortPath("")).toBe("");
  });
});
