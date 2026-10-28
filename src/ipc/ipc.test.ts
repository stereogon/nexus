/**
 * The other half of the IPC contract.
 *
 * `crates/src-tauri/tests/ipc_contract.rs` runs the real `open_vault` command against a
 * real vault and pins what it produces as `fixtures/vault-summary.json`. This asserts the
 * Zod schemas accept exactly those bytes, so neither side can move without the other
 * failing.
 *
 * Without this pair, the Rust structs and these schemas are two descriptions of one shape,
 * free to drift. The drift would surface as a blank sidebar in front of someone trying to
 * study, which is the worst place to discover it.
 */
import { describe, expect, it } from "vitest";

import summaryFixture from "../../fixtures/vault-summary.json";
import {
  asCommandError,
  CommandErrorSchema,
  VaultSummarySchema,
  type VaultSummary,
} from "./vault";

describe("the vault summary contract", () => {
  it("accepts the summary the Rust command actually produces", () => {
    const parsed = VaultSummarySchema.parse(summaryFixture);

    expect(parsed.lectures).toHaveLength(2);
    expect(parsed.unloadable).toHaveLength(1);
  });

  it("carries the facets a sidebar groups on", () => {
    const summary: VaultSummary = VaultSummarySchema.parse(summaryFixture);
    const [converted] = summary.lectures;

    expect(converted?.course).toBe("CS454 Distributed Systems");
    expect(converted?.week).toBe("Week 3");
    expect(converted?.tags).toStrictEqual(["consensus", "exam"]);
    expect(converted?.conversion).toBe("ready");
    expect(converted?.documentReady).toBe(true);
  });

  it("accepts a lecture with no taxonomy at all", () => {
    // The reason the fixture holds two lectures rather than one. A fixture where every
    // optional field is filled proves nothing about whether this side copes when they
    // are not.
    const summary = VaultSummarySchema.parse(summaryFixture);
    const [, plain] = summary.lectures;

    expect(plain?.course).toBeNull();
    expect(plain?.module).toBeNull();
    expect(plain?.week).toBeNull();
    expect(plain?.tags).toStrictEqual([]);
  });

  it("gives every unreadable lecture a sentence saying what to do next", () => {
    const summary = VaultSummarySchema.parse(summaryFixture);

    for (const problem of summary.unloadable) {
      expect(problem.remediation.length).toBeGreaterThan(0);
      expect(problem.directory.length).toBeGreaterThan(0);
    }
  });

  it("refuses a conversion state it does not know", () => {
    // A state added in Rust without being added here must fail loudly, not render as a
    // blank badge.
    const tampered = {
      ...summaryFixture,
      lectures: [{ ...summaryFixture.lectures[0], conversion: "halfway" }],
    };

    expect(() => VaultSummarySchema.parse(tampered)).toThrow();
  });

  it("refuses a summary missing a list entirely", () => {
    const { root, lectures, unloadable } = summaryFixture;

    expect(() => VaultSummarySchema.parse({ root, lectures, unloadable })).toThrow();
  });
});

describe("command errors", () => {
  it("passes through a rejection that matches the contract", () => {
    const error = asCommandError({ code: "ERR_IO", remediation: "Try again." });

    expect(error.code).toBe("ERR_IO");
    expect(error.remediation).toBe("Try again.");
  });

  it("describes a rejection that does not, rather than showing a Zod report", () => {
    // A malformed rejection is a bug in the adapter, not something the person did, so the
    // message says so instead of handing them a parser error they cannot act on.
    for (const thrown of [undefined, null, "a bare string", 7, {}, { code: 1 }]) {
      const error = asCommandError(thrown);

      expect(error.code).toBe("ERR_UNEXPECTED_IPC_FAILURE");
      expect(error.remediation.length).toBeGreaterThan(0);
    }
  });

  it("is itself a schema, so a rejection is validated and not trusted", () => {
    expect(CommandErrorSchema.safeParse({ code: "ERR_IO" }).success).toBe(false);
  });
});
