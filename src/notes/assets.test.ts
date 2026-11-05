/**
 * Which image paths a note may load: only files directly inside the lecture's `assets/`.
 */
import { describe, expect, it } from "vitest";

import { isAssetPath } from "./assets";

describe("an image path", () => {
  it("is loaded when it names a file in the lecture's assets folder", () => {
    expect(isAssetPath("assets/20261105-101530-ab12cd34ef56ab78.png")).toBe(true);
  });

  it("is not loaded when it climbs out of the lecture", () => {
    expect(isAssetPath("../../secret.png")).toBe(false);
    expect(isAssetPath("assets/../../secret.png")).toBe(false);
    expect(isAssetPath("assets/..png")).toBe(false);
  });

  it("is not loaded from anywhere absolute", () => {
    expect(isAssetPath("/Users/me/Desktop/a.png")).toBe(false);
  });

  it("is not loaded from the web, which an offline app never fetches", () => {
    expect(isAssetPath("https://example.com/a.png")).toBe(false);
  });

  it("is not loaded from a folder inside assets", () => {
    expect(isAssetPath("assets/nested/a.png")).toBe(false);
  });
});
