// @vitest-environment jsdom
/**
 * What the overlay draws, and what it refuses to get in the way of.
 *
 * The positions asserted here are the ones the component computes from the stored
 * fractions, not the ones a browser lays out — jsdom has no layout engine. So this checks
 * the arithmetic and the markup; whether a highlight visually lands on its words needs the
 * browser suite.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Annotation } from "../ipc/annotations";
import { HighlightLayer, rectsOf } from "./HighlightLayer";
import type { MenuAt } from "./useHighlightMenu";

afterEach(cleanup);

const PAGE = { width: 800, height: 1000 };

/** One builder per kind, so none of them needs a cast to be the union it claims to be. */
type OfKind<K extends Annotation["kind"]> = Extract<Annotation, { kind: K }>;

const WHEN = {
  createdAt: "2026-10-27T16:00:00Z",
  updatedAt: "2026-10-27T16:00:00Z",
} as const;

function highlight(over: Partial<OfKind<"textHighlight">> = {}): Annotation {
  return {
    kind: "textHighlight",
    id: "hl-1",
    page: 4,
    semantic: "key",
    quote: "Raft achieves consensus.",
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    ...WHEN,
    ...over,
  };
}

function area(over: Partial<OfKind<"areaHighlight">> = {}): Annotation {
  return {
    kind: "areaHighlight",
    id: "ar-1",
    page: 4,
    semantic: "definition",
    region: { x: 0.2, y: 0.3, width: 0.4, height: 0.25 },
    ...WHEN,
    ...over,
  };
}

function textBox(): Annotation {
  return {
    kind: "textBox",
    id: "tb-1",
    page: 4,
    region: { x: 0.55, y: 0.12, width: 0.3, height: 0.08 },
    text: "Ask about 2-phase commit",
    ...WHEN,
  };
}

function show(
  annotations: readonly Annotation[],
  onPick: (annotation: Annotation, at: MenuAt) => void = vi.fn(),
) {
  const { container } = render(
    <HighlightLayer
      annotations={annotations}
      height={PAGE.height}
      onPick={onPick}
      width={PAGE.width}
    />,
  );

  return { container, onPick };
}

describe("what it draws", () => {
  it("draws nothing at all for a page with no highlights", () => {
    // Not an empty layer: an element covering the page, even a transparent one, is one
    // more thing between the cursor and the text.
    const { container } = show([]);

    expect(container.firstChild).toBeNull();
  });

  it("places a rectangle from its stored fractions", () => {
    const { container } = show([highlight()]);
    const drawn = container.querySelector(".highlight");

    expect(drawn?.getAttribute("style")).toContain("left: 80px");
    expect(drawn?.getAttribute("style")).toContain("top: 200px");
    expect(drawn?.getAttribute("style")).toContain("width: 240px");
  });

  it("draws one rectangle per line of a wrapped highlight", () => {
    const { container } = show([
      highlight({
        rects: [
          { x: 0.1, y: 0.2, width: 0.8, height: 0.02 },
          { x: 0.1, y: 0.23, width: 0.2, height: 0.02 },
        ],
      }),
    ]);

    expect(container.querySelectorAll(".highlight")).toHaveLength(2);
  });

  it("gives a wrapped highlight one badge, not one per line", () => {
    const { container } = show([
      highlight({
        rects: [
          { x: 0.1, y: 0.2, width: 0.8, height: 0.02 },
          { x: 0.1, y: 0.23, width: 0.2, height: 0.02 },
        ],
      }),
    ]);

    expect(container.querySelectorAll(".highlight-badge")).toHaveLength(1);
  });

  it("carries the semantic as data rather than as a colour", () => {
    // The colour is a token the stylesheet owns. Writing a hex here would be the same
    // mistake the domain refuses to make, one layer up.
    const { container } = show([highlight({ semantic: "exam" })]);

    expect(container.querySelector(".highlight")?.getAttribute("data-semantic")).toBe(
      "exam",
    );
  });

  it("draws an area highlight from its single region", () => {
    const { container } = show([area({ caption: "The election state machine" })]);

    expect(container.querySelectorAll(".highlight")).toHaveLength(1);
  });

  it("draws no text box, since nothing creates one yet", () => {
    const { container } = show([textBox()]);

    expect(container.querySelectorAll(".highlight")).toHaveLength(0);
  });
});

describe("what it says", () => {
  it("names a highlight by its meaning and what it covers", () => {
    show([highlight({ semantic: "definition", quote: "A quorum is a majority." })]);

    expect(
      screen.getByRole("button", { name: "Definition: A quorum is a majority." }),
    ).toBeDefined();
  });

  it("falls back to the meaning alone when there is nothing quoted", () => {
    show([area({ semantic: "question" })]);

    expect(screen.getByRole("button", { name: "Question" })).toBeDefined();
  });

  it("shows the letter, which is what tells the four apart without colour", () => {
    show([highlight({ semantic: "exam" })]);

    expect(screen.getByRole("button", { name: /^Exam/u }).textContent).toBe("E");
  });
});

describe("picking one", () => {
  it("reports the highlight and where its badge is", () => {
    // Typed rather than a bare `vi.fn()`, so the call can be read without `expect.any`,
    // which is an `any` and banned by §4 even in a test.
    const onPick = vi.fn<(annotation: Annotation, at: MenuAt) => void>();

    show([highlight({ id: "hl-7" })], onPick);
    fireEvent.click(screen.getByRole("button", { name: /^Key concept/u }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.lastCall?.[0].id).toBe("hl-7");

    // That a position was reported at all is what can be checked here. jsdom gives every
    // element a zero rectangle, so *where* the menu would open is the browser suite's.
    expect(onPick.mock.lastCall?.[1]).toHaveProperty("left");
    expect(onPick.mock.lastCall?.[1]).toHaveProperty("top");
  });
});

describe("which area a kind covers", () => {
  it("is the lines for a text highlight and the region for an area one", () => {
    expect(rectsOf(highlight())).toHaveLength(1);
    expect(rectsOf(area())).toHaveLength(1);
  });

  it("is nothing for a text box, which this layer does not draw", () => {
    expect(rectsOf(textBox())).toBeNull();
  });
});
