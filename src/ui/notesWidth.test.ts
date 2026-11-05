import { describe, expect, it } from "vitest";

import { fitNotesWidth, NOTES_MIN, VIEWER_MIN, widestNotes } from "./notesWidth";

describe("fitting the notes width", () => {
  it("keeps a width that fits", () => {
    expect(fitNotesWidth(480, 1400)).toBe(480);
  });

  it("never goes below the narrowest notes", () => {
    expect(fitNotesWidth(120, 1400)).toBe(NOTES_MIN);
  });

  it("always leaves the document its room", () => {
    expect(fitNotesWidth(1300, 1400)).toBe(1400 - VIEWER_MIN);
  });

  it("re-fits a width chosen on a wider screen", () => {
    // Chosen at 1200 on an external monitor; on the laptop the area is 1000.
    expect(fitNotesWidth(1200, 1000)).toBe(1000 - VIEWER_MIN);
  });

  it("keeps the notes usable when the area cannot fit both", () => {
    expect(widestNotes(500)).toBe(NOTES_MIN);
    expect(fitNotesWidth(900, 500)).toBe(NOTES_MIN);
  });

  it("is whole pixels, which is what gets recorded", () => {
    expect(fitNotesWidth(480.6, 1400)).toBe(481);
  });
});
