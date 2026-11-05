import { describe, expect, it } from "vitest";

import { findOnPage, startingMatch, steppedMatch, type FindMatch } from "./find";

describe("finding on a page", () => {
  it("finds every match, ignoring case, with offsets into the original text", () => {
    expect(findOnPage("Raft elects a leader. The LEADER leads.", "leader", 2)).toEqual([
      { pageIndex: 2, start: 14, length: 6 },
      { pageIndex: 2, start: 26, length: 6 },
    ]);
  });

  it("does not overlap matches", () => {
    expect(findOnPage("aaaa", "aa", 0).map((match) => match.start)).toEqual([0, 2]);
  });

  it("finds nothing for a blank query", () => {
    expect(findOnPage("anything", "  ", 0)).toEqual([]);
  });

  it("keeps offsets right after a letter that lowercases to two units", () => {
    // `İ` lowercases to `i̇` (two UTF-16 units); the match after it must not shift.
    const text = "İstanbul has a quorum";
    const [match] = findOnPage(text, "quorum", 0);

    expect(text.slice(match?.start, (match?.start ?? 0) + (match?.length ?? 0))).toBe("quorum");
  });

  it("keeps offsets right after emoji, which are two units each", () => {
    const text = "📌📌 quorum";
    const [match] = findOnPage(text, "QUORUM", 0);

    expect(text.slice(match?.start, (match?.start ?? 0) + (match?.length ?? 0))).toBe("quorum");
  });
});

describe("moving between matches", () => {
  const MATCHES: readonly FindMatch[] = [
    { pageIndex: 0, start: 0, length: 1 },
    { pageIndex: 3, start: 0, length: 1 },
    { pageIndex: 3, start: 5, length: 1 },
  ];

  it("starts on the first match on or after the page being read", () => {
    expect(startingMatch(MATCHES, 2)).toBe(1);
    expect(startingMatch(MATCHES, 0)).toBe(0);
  });

  it("starts at the first match when every match is before the page being read", () => {
    expect(startingMatch(MATCHES, 9)).toBe(0);
  });

  it("has nowhere to start with no matches", () => {
    expect(startingMatch([], 0)).toBeNull();
  });

  it("steps forward and back, wrapping round", () => {
    expect(steppedMatch(2, 3, 1)).toBe(0);
    expect(steppedMatch(0, 3, -1)).toBe(2);
    expect(steppedMatch(null, 3, -1)).toBe(2);
    expect(steppedMatch(null, 0, 1)).toBeNull();
  });
});
