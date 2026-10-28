/**
 * The other half of the document contract.
 *
 * `crates/src-tauri/tests/document_contract.rs` runs the real command against a real vault
 * and pins what it produces as `fixtures/document.json`. This asserts the Zod schema
 * accepts those exact bytes, so the two sides cannot drift apart silently: a field renamed
 * in Rust fails here, and a schema tightened here fails against the fixture.
 *
 * It matters more than the usual contract test because this payload describes a *foreign*
 * document. Screening a file and then mis-reading the answer is worse than not screening it.
 */
import { describe, expect, it } from "vitest";

import documentFixture from "../../fixtures/document.json";
import { OpenedDocumentSchema, RiskSeveritySchema } from "./document";

describe("the opened-document contract", () => {
  it("accepts a document the scan found nothing in", () => {
    const parsed = OpenedDocumentSchema.parse(documentFixture.clean);

    expect(parsed.risks).toHaveLength(0);
    expect(parsed.needsAttention).toBe(false);
    expect(parsed.bytes).toBeGreaterThan(0);
  });

  it("accepts a document with indicators, worst first", () => {
    // The order is the domain's, not this side's: `DocumentRisk` is declared in severity
    // order and collected from a set, so a UI showing the first one shows the one that
    // matters. If that ever stops holding, it should fail here.
    const parsed = OpenedDocumentSchema.parse(documentFixture.flagged);

    expect(parsed.risks.map((risk) => risk.code)).toEqual([
      "embeddedJavascript",
      "actionOnOpen",
      "attachedFile",
      "xfaForm",
      "externalLink",
    ]);

    const severities = parsed.risks.map((risk) => risk.severity);

    expect(severities.indexOf("informational")).toBeGreaterThan(
      severities.lastIndexOf("notable"),
    );
  });

  it("flags the document that needs reading before opening", () => {
    expect(OpenedDocumentSchema.parse(documentFixture.flagged).needsAttention).toBe(
      true,
    );
  });

  it("carries a sentence saying what Nexus does, for every indicator", () => {
    // §1.4. A person told only what a file contains has been given a worry and no way to
    // put it down, so the second sentence is the one that does the work.
    const parsed = OpenedDocumentSchema.parse(documentFixture.flagged);

    for (const risk of parsed.risks) {
      expect(risk.explanation).toContain("Nexus");
      expect(risk.explanation.length).toBeGreaterThan(40);
    }
  });

  it("refuses a severity it does not know", () => {
    // Not a value to render, but a mismatch between the two sides. Reading an unknown
    // severity as "informational" would be the dangerous direction to fail in, so the enum
    // rejects rather than falls back.
    expect(() => RiskSeveritySchema.parse("critical")).toThrow();
    expect(() => RiskSeveritySchema.parse("notable ")).toThrow();
  });

  it("refuses a payload missing the attention flag", () => {
    // Which is what a stale Rust build would send. Defaulting it to false would hide
    // exactly the finding it exists to surface.
    const parsed = OpenedDocumentSchema.parse(documentFixture.flagged);

    expect(() =>
      OpenedDocumentSchema.parse({
        path: parsed.path,
        bytes: parsed.bytes,
        risks: parsed.risks,
      }),
    ).toThrow();
  });

  it("refuses a negative size", () => {
    expect(() =>
      OpenedDocumentSchema.parse({ ...documentFixture.clean, bytes: -1 }),
    ).toThrow();
  });
});
