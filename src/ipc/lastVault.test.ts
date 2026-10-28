/**
 * The last-opened vault payload.
 *
 * Small, and worth its own assertions precisely because it is small: a bare `string | null`
 * has no field names to disagree about, so a mistake here is silent rather than loud.
 */
import { describe, expect, it } from "vitest";

import { LastVaultSchema } from "./vault";

describe("the last-opened vault payload", () => {
  it("accepts a path", () => {
    expect(LastVaultSchema.parse("/Users/someone/StudyVault")).toBe(
      "/Users/someone/StudyVault",
    );
  });

  it("accepts the null Rust sends for nothing remembered", () => {
    // `Option<String>::None` serialises to `null`. A schema demanding a string would make
    // a first launch a crash.
    expect(LastVaultSchema.parse(null)).toBeNull();
  });

  it("does not accept undefined in place of null", () => {
    // Which would mean the command had not been registered, or had been renamed. That is a
    // wiring fault and should read as one, rather than quietly becoming "no vault".
    expect(() => LastVaultSchema.parse(undefined)).toThrow();
  });

  it("keeps a path that is only whitespace distinguishable from nothing", () => {
    // The Rust side already refuses to hand back an empty or whitespace-only recorded
    // path. This pins the division of labour: emptiness is decided there, not here, so this
    // side must not start treating a string as absence.
    expect(LastVaultSchema.parse("   ")).toBe("   ");
  });
});
