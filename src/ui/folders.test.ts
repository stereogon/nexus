import { describe, expect, it } from "vitest";

import { isWithin, nameOf, parentOf, spoken, trail, vaultNameOf } from "./folders";

describe("folder paths", () => {
  it("finds the folder an item is in, and the top of the vault as empty", () => {
    expect(parentOf("CS454/Week 3/raft")).toBe("CS454/Week 3");
    expect(parentOf("raft")).toBe("");
  });

  it("names a path by its last segment", () => {
    expect(nameOf("CS454/Week 3")).toBe("Week 3");
    expect(nameOf("raft")).toBe("raft");
  });

  it("lists each folder from the top down", () => {
    expect(trail("CS454/Week 3")).toEqual(["CS454", "CS454/Week 3"]);
    expect(trail("")).toEqual([]);
  });

  it("knows what is inside a folder, without being fooled by a shared prefix", () => {
    expect(isWithin("CS454/Week 3/raft", "CS454")).toBe(true);
    expect(isWithin("CS4540/raft", "CS454")).toBe(false);
    expect(isWithin("anything", "")).toBe(true);
  });

  it("says where something is in words", () => {
    expect(spoken("CS454/Week 3")).toBe("CS454 / Week 3");
    expect(spoken("")).toBe("");
  });

  it("names the vault by its own folder, trailing slash or not", () => {
    expect(vaultNameOf("/Users/me/StudyVault/")).toBe("StudyVault");
    expect(vaultNameOf("/")).toBe("Vault");
  });
});
