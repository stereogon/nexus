/**
 * The other half of the reorganize contract.
 *
 * `crates/src-tauri/tests/reorganize_contract.rs` runs the real `preview` and `apply`
 * against a real vault and pins what they produce as `fixtures/reorganize.json`. This
 * asserts the Zod schemas accept exactly those bytes, so neither side can move without the
 * other failing.
 *
 * The pair has already earned its keep once: the schema was first written with `stopped_by`
 * where `rename_all = "camelCase"` produces `stoppedBy`. The drift would have surfaced as a
 * reorganize panel that refuses to open in front of someone trying to tidy their vault.
 */
import { describe, expect, it } from "vitest";

import reorganizeFixture from "../../fixtures/reorganize.json";
import {
  BlockedRowSchema,
  DEFAULT_TEMPLATE,
  ReorganizePreviewSchema,
  ReorganizeResultSchema,
} from "./reorganize";

const { preview, result } = reorganizeFixture;

describe("the reorganize preview contract", () => {
  it("accepts the preview the Rust command actually produces", () => {
    const parsed = ReorganizePreviewSchema.parse(preview);

    expect(parsed.moves).toHaveLength(1);
    expect(parsed.blocked).toHaveLength(3);
    expect(parsed.unchanged).toBe(0);
  });

  it("carries the move the panel would show, rendered under the default template", () => {
    // The fixture was produced under this same template, so a change to either that is
    // not a change to both fails here rather than in a preview nobody tested.
    expect(DEFAULT_TEMPLATE).toBe("{course}/{week}-{title}");

    const parsed = ReorganizePreviewSchema.parse(preview);
    const [move] = parsed.moves;

    expect(move?.from).toBe("raft");
    expect(move?.to).toBe("cs454/week-3-raft-consensus");
  });

  it("accepts a blocked lecture with nowhere it wanted to be", () => {
    // `wanted` is null when the template produced no usable name at all. The reason the
    // fixture holds three blocked lectures rather than one: a fixture where every optional
    // field is filled proves nothing about whether this side copes when they are not.
    const parsed = ReorganizePreviewSchema.parse(preview);
    const unnameable = parsed.blocked.filter((row) => row.wanted === null);

    expect(unnameable).toHaveLength(1);
    expect(unnameable[0]?.reason).toBe("nameUnusable");
  });

  it("gives every blocked lecture a sentence saying what to do next", () => {
    // §1.4: the reader is a tired student, and "cannot file this" with no next step is
    // worse than not saying anything.
    const parsed = ReorganizePreviewSchema.parse(preview);

    for (const row of parsed.blocked) {
      expect(row.remediation.length).toBeGreaterThan(0);
      expect(row.directory.length).toBeGreaterThan(0);
    }
  });

  it("refuses a block reason it does not know", () => {
    // A `ReorganizeBlock` variant added in Rust without being added here must fail loudly,
    // not render as a blank row in the blocked list.
    expect(() =>
      BlockedRowSchema.parse({ ...preview.blocked[0], reason: "somethingElse" }),
    ).toThrow();
  });

  it("refuses a preview missing a list entirely", () => {
    const { moves, unchanged } = preview;

    expect(() => ReorganizePreviewSchema.parse({ moves, unchanged })).toThrow();
  });
});

describe("the reorganize result contract", () => {
  it("accepts the result the Rust command actually produces", () => {
    const parsed = ReorganizeResultSchema.parse(result);

    expect(parsed.moved).toHaveLength(1);
    expect(parsed.complete).toBe(true);
    expect(parsed.stoppedBy).toBeNull();
    expect(parsed.positionsLost).toBeNull();
  });

  it("insists on the camelCase name serde actually emits", () => {
    // The drift this pair was written for. `stopped_by` must not parse, or the panel would
    // read a partial reorganize as a complete one and say nothing about what stopped it.
    const renamed = { ...result, stoppedBy: undefined, stopped_by: null };

    expect(() => ReorganizeResultSchema.parse(renamed)).toThrow();
  });

  it("accepts a reorganize that stopped part-way, with a reason", () => {
    // Not in the fixture, because pinning it would mean making a real move fail. A partial
    // reorganize is reported rather than raised, so this shape is the one the panel needs
    // to render and it must parse.
    const stopped = ReorganizeResultSchema.parse({
      ...result,
      complete: false,
      stoppedBy: { code: "ERR_IO", remediation: "Try the reorganize again." },
    });

    expect(stopped.complete).toBe(false);
    expect(stopped.stoppedBy?.code).toBe("ERR_IO");
  });

  it("accepts a reorganize whose reading positions could not follow", () => {
    // Also not in the fixture: pinning it would mean making a real write fail. The folders
    // moved, so this is reported alongside the moves rather than instead of them, and the
    // panel needs the shape to parse in order to say so.
    const lost = ReorganizeResultSchema.parse({
      ...result,
      positionsLost: {
        code: "ERR_IO",
        remediation: "Open each lecture again to set where you were.",
      },
    });

    expect(lost.complete).toBe(true);
    expect(lost.moved).toHaveLength(1);
    expect(lost.positionsLost?.code).toBe("ERR_IO");
  });

  it("refuses a stop reason with no remediation", () => {
    expect(() =>
      ReorganizeResultSchema.parse({ ...result, stoppedBy: { code: "ERR_IO" } }),
    ).toThrow();
  });
});
