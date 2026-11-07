/**
 * Keeping the open lecture's row in step with an edit.
 *
 * The rule is tested rather than the hook: opening a lecture reaches for a document, while
 * the only thing with a decision in it is which of the two lectures was edited.
 */
import { describe, expect, it } from "vitest";

import type { LectureRow } from "../ipc/vault";
import type { OpenLecture } from "./useOpenLecture";
import { refiled } from "./useOpenLecture";

function row(directory: string, title: string): LectureRow {
  return {
    directory,
    kind: "document",
    title,
    number: null,
    numberInTitle: null,
    sequence: "a0",
    course: "Software Systems Engineering",
    module: null,
    week: "Week 2",
    tags: [],
    conversion: "notRequired",
    documentReady: true,
  };
}

/**
 * A screened document, which this rule only ever carries across untouched.
 *
 * Written out in full rather than stubbed through a cast: the shape is four plain fields,
 * and a cast here would be the project's own banned shortcut (§4) hiding the day the shape
 * changes.
 */
const DOCUMENT: OpenLecture["document"] = {
  path: "/vault/week-2/process-overview/document.pdf",
  bytes: 184_320,
  risks: [],
  needsAttention: false,
};

const READING: OpenLecture = {
  document: DOCUMENT,
  lecture: row("week-2/process-overview", "2. ProcessOverview"),
};

describe("after an edit", () => {
  it("leaves the open lecture alone when a different one was edited", () => {
    // The case the panel made ordinary: with a document open you can now edit any row in
    // the sidebar, and most of them are not the one on screen.
    const after = refiled(READING, "week-1/foundations", row("week-1/foundations", "Renamed"));

    expect(after).toBe(READING);
  });

  it("takes the new row when the open lecture was the one edited", () => {
    const saved = row("week-2/process-overview", "2. The Requirements Engineering Process");
    const after = refiled(READING, "week-2/process-overview", saved);

    expect(after?.lecture).toBe(saved);
  });

  it("keeps the document it already loaded", () => {
    // Re-opening would throw away a screened, parsed PDF to arrive back where it started.
    // An edit writes facets into the manifest and does not move the folder.
    const saved = row("week-2/process-overview", "Renamed");
    const after = refiled(READING, "week-2/process-overview", saved);

    expect(after?.document).toBe(DOCUMENT);
  });

  it("has nothing to do when no lecture is open", () => {
    expect(refiled(null, "week-2/process-overview", row("week-2/process-overview", "x"))).toBeNull();
  });
});
