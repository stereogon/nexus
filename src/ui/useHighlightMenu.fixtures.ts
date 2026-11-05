/**
 * What the `useHighlightMenu` tests share: a menu position, a highlight, and a fake set of
 * annotations whose methods record their calls.
 *
 * Shared rather than copied into each test file, since the fake has to keep up with the
 * `Annotations` interface and two copies would fall behind it separately.
 */
import { vi } from "vitest";

import type { Annotation } from "../ipc/annotations";
import type { Annotations } from "./useAnnotations";

export const AT = { left: 100, top: 200, above: 180 };

export const HIGHLIGHT: Annotation = {
  kind: "textHighlight",
  id: "hl-7",
  page: 4,
  semantic: "key",
  quote: "Raft achieves consensus.",
  rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
  createdAt: "2026-10-27T16:00:00Z",
  updatedAt: "2026-10-27T16:00:00Z",
};

export function annotations(): Annotations {
  return {
    all: [HIGHLIGHT],
    failure: null,
    add: vi.fn(() => Promise.resolve(null)),
    addArea: vi.fn(() => Promise.resolve(null)),
    addTextBox: vi.fn(() => Promise.resolve(null)),
    editTextBox: vi.fn(),
    remove: vi.fn(),
    retag: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    clearFailure: vi.fn(),
  };
}
