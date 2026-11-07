import { describe, expect, it } from "vitest";

import { CODE_CHOICES, choiceFor } from "./codeLanguages";

describe("a code block's language", () => {
  it("reads any name a language goes by as its menu choice", () => {
    expect(choiceFor("javascript")).toEqual({ label: "JavaScript", tag: "js" });
    expect(choiceFor("TSX")).toEqual({ label: "TypeScript", tag: "ts" });
    expect(choiceFor("json")).toEqual({ label: "JSON", tag: "json" });
    expect(choiceFor("")).toEqual({ label: "Plain text", tag: "" });
  });

  it("keeps a language nothing colours as itself, rather than calling it plain text", () => {
    expect(choiceFor("python")).toEqual({ label: "python (not coloured)", tag: "python" });
  });

  it("offers plain text and every installed language", () => {
    expect(CODE_CHOICES.map((choice) => choice.label)).toEqual(["Plain text", "JavaScript", "TypeScript", "JSON", "CSS", "HTML"]);
  });
});
