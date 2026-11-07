import { describe, expect, it } from "vitest";

import { headingMeta } from "./pageHeading";

describe("the line under the notes' title", () => {
  it("says when the item was made, then its tags", () => {
    expect(headingMeta("2026-11-02T10:00:00Z", ["errands", "uni", "gym"])).toBe("Created 2 November 2026 · errands, uni, gym");
  });

  it("leaves out tags it does not have", () => {
    expect(headingMeta("2026-11-02T10:00:00Z", [])).toBe("Created 2 November 2026");
  });

  it("says nothing of a date it cannot read, rather than an invalid one", () => {
    expect(headingMeta("not a date", ["exam"])).toBe("exam");
  });
});
