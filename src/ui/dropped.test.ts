/**
 * What the window says after a drop.
 *
 * These sentences are the whole of what someone learns about an import that half worked, so
 * they are tested as carefully as the code that does the importing. There is no component
 * test harness yet, which is the reason this logic lives outside the component at all.
 */
import { describe, expect, it } from "vitest";

import type { CommandError, ConversionState, LectureRow } from "../ipc/vault";
import { noteFor, noteForDrop, type DropOutcome } from "./dropped";

function lecture(title: string, conversion: ConversionState): LectureRow {
  return {
    directory: title.toLowerCase(),
    title,
    sequence: "a0",
    course: null,
    module: null,
    week: null,
    tags: [],
    conversion,
    documentReady: conversion === "ready" || conversion === "notRequired",
  };
}

function added(title: string, conversion: ConversionState = "ready"): DropOutcome {
  return { kind: "added", lecture: lecture(title, conversion) };
}

function refused(remediation: string): DropOutcome {
  const error: CommandError = { code: "ERR_UNSUPPORTED_FORMAT", remediation };

  return { kind: "refused", error };
}

describe("the note for one import", () => {
  it("names the lecture when there is nothing else to say", () => {
    expect(noteFor(lecture("Raft Consensus", "ready"))).toBe(
      'Added "Raft Consensus".',
    );
  });

  it("says a conversion failed without calling the import a failure", () => {
    // The import succeeded: the original is in the vault. Reporting this as an error would
    // be untrue, and would suggest the file needs adding again.
    const note = noteFor(lecture("Vector Clocks", "failed"));

    expect(note).toContain("could not be converted");
    expect(note).toContain("The original is kept");
  });

  it("says what a queued conversion is waiting for", () => {
    expect(noteFor(lecture("Paxos", "queued"))).toContain("LibreOffice");
  });

  it("has a sentence for every conversion state", () => {
    // `noteFor` switches exhaustively, so a state added in Rust and in the Zod enum without
    // a sentence here is a compile error. This asserts the runtime half: none of them
    // returns an empty string.
    const states: readonly ConversionState[] = [
      "notRequired",
      "queued",
      "converting",
      "ready",
      "failed",
    ];

    for (const state of states) {
      expect(noteFor(lecture("Lecture", state)).length).toBeGreaterThan(0);
    }
  });
});

describe("the note for a whole drop", () => {
  it("says nothing when nothing was dropped", () => {
    expect(noteForDrop([])).toBeNull();
  });

  it("falls back to the single-file sentence for one file", () => {
    // A summary would be a worse answer to a smaller question: the title is more use than
    // a count of one.
    expect(noteForDrop([added("Raft Consensus")])).toBe(
      'Added "Raft Consensus".',
    );
  });

  it("counts them when several arrive together", () => {
    expect(noteForDrop([added("One"), added("Two"), added("Three")])).toBe(
      "Added 3 lectures.",
    );
  });

  it("reports the moves and the conversions that did not happen", () => {
    const note = noteForDrop([
      added("One"),
      added("Two", "queued"),
      added("Three", "failed"),
    ]);

    expect(note).toContain("Added 3 lectures.");
    expect(note).toContain("2 of them could not be converted");
  });

  it("keeps the successes when one file is refused", () => {
    // §1.4, and the reason the outcomes are collected rather than thrown: a screenshot
    // among the slide decks must not hide that the decks are in.
    const note = noteForDrop([
      added("One"),
      refused("Nexus imports PDF, PowerPoint and Word documents."),
      added("Two"),
    ]);

    expect(note).toContain("Added 2 lectures.");
    expect(note).toContain("1 file could not be added.");
    expect(note).toContain("Nexus imports PDF");
  });

  it("says the same reason once, however many files hit it", () => {
    // Dropping six screenshots is one mistake, not six. Repeating the advice six times
    // reads like the app is shouting.
    const reason = "Nexus imports PDF, PowerPoint and Word documents.";
    const note = noteForDrop([refused(reason), refused(reason), refused(reason)]);

    expect(note).toBe(`3 files could not be added. ${reason}`);
  });

  it("keeps distinct reasons, because they need different things done", () => {
    const note = noteForDrop([
      refused("Nexus imports PDF, PowerPoint and Word documents."),
      refused("A lecture with that name is already in this vault."),
    ]);

    expect(note).toContain("Nexus imports PDF");
    expect(note).toContain("already in this vault");
  });

  it("reports a drop where everything was refused as no additions at all", () => {
    const note = noteForDrop([refused("Not a document Nexus can read.")]);

    expect(note).not.toContain("Added");
  });
});
