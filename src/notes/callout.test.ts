/**
 * Which quote lines open a callout, in GitHub's alert form.
 */
import { describe, expect, it } from "vitest";

import { calloutMarker, calloutOf } from "./callout";

describe("a callout's marker line", () => {
  it("is GitHub's alert, in any case", () => {
    expect(calloutOf("> [!NOTE]")).toBe("note");
    expect(calloutOf(">[!warning]  ")).toBe("warning");
    expect(calloutMarker("caution")).toBe("> [!CAUTION]");
  });

  it("is nothing else: a plain quote, a kind GitHub does not have, words after it", () => {
    expect(calloutOf("> just a quote")).toBeNull();
    expect(calloutOf("> [!DANGER]")).toBeNull();
    expect(calloutOf("> [!NOTE] and more")).toBeNull();
  });
});
