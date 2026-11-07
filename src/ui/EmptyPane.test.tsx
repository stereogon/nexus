// @vitest-environment jsdom
/**
 * The empty pane: the ghost, the rotating line, and the instruction that never rotates.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmptyPane, EMPTY_LINES, lineFor } from "./EmptyPane";
import { runs } from "./PixelGhost";

afterEach(cleanup);

describe("choosing a line", () => {
  it("reaches every line, and only those", () => {
    const rolled = new Set(
      Array.from({ length: 200 }, (_, at) => lineFor(at / 200)),
    );

    expect([...rolled].sort()).toEqual([...EMPTY_LINES].sort());
  });

  it("stays in range at both ends, and past them", () => {
    // `Math.random()` cannot return 1, but a caller that passes one should still get a
    // line rather than `undefined` -- which `noUncheckedIndexedAccess` would otherwise
    // let through as a silently blank greeting.
    for (const roll of [-1, 0, 0.999_999_9, 1, 42]) {
      expect(EMPTY_LINES).toContain(lineFor(roll));
    }
  });
});

describe("what the pane shows", () => {
  it("greets with one of the lines, and always says what to do", () => {
    render(<EmptyPane busy={false} folder="Week 3" onAdd={vi.fn()} onChooseVault={vi.fn()} />);

    const greeting = EMPTY_LINES.filter((line) => screen.queryByText(line) !== null);

    expect(greeting).toHaveLength(1);

    // The instruction is not part of the rotation. A pane that is only witty leaves
    // someone no better off than a blank one.
    expect(screen.getByText(/Open something from the sidebar/u)).toBeDefined();
    expect(screen.getByText("⌘O")).toBeDefined();
  });

  it("keeps the same line across re-renders", () => {
    const { rerender } = render(
      <EmptyPane busy={false} folder="Week 3" onAdd={vi.fn()} onChooseVault={vi.fn()} />,
    );
    const first = EMPTY_LINES.find((line) => screen.queryByText(line) !== null);

    rerender(<EmptyPane busy folder="Week 3" onAdd={vi.fn()} onChooseVault={vi.fn()} />);

    expect(screen.queryByText(first ?? "")).not.toBeNull();
  });

  it("hides the ghost from assistive technology, being decoration", () => {
    const { container } = render(
      <EmptyPane busy={false} folder="Week 3" onAdd={vi.fn()} onChooseVault={vi.fn()} />,
    );

    expect(container.querySelector(".pixel-ghost")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("offers both ways out, and disables them while the vault is busy", () => {
    const props = { onAdd: vi.fn(), onChooseVault: vi.fn() };

    render(<EmptyPane busy={false} folder="Week 3" {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Import a document" }));
    fireEvent.click(screen.getByRole("button", { name: "Open another vault" }));

    expect(props.onAdd).toHaveBeenCalled();
    expect(props.onChooseVault).toHaveBeenCalled();

    cleanup();
    render(<EmptyPane busy folder="Week 3" {...props} />);

    for (const name of ["Import a document", "Open another vault"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
  });
});

describe("the sprite", () => {
  it("merges a row into runs rather than a rect per pixel", () => {
    expect(runs("##..####..##")).toEqual([
      { from: 0, width: 2 },
      { from: 4, width: 4 },
      { from: 10, width: 2 },
    ]);
  });

  it("closes a run that reaches the end of the row", () => {
    // The loop runs one past the last column for exactly this case; without it the final
    // run is never pushed and the ghost loses its right edge.
    expect(runs("..####")).toEqual([{ from: 2, width: 4 }]);
    expect(runs("######")).toEqual([{ from: 0, width: 6 }]);
  });

  it("draws nothing for an empty row", () => {
    expect(runs("......")).toEqual([]);
  });

  it("draws every row of the ghost", () => {
    const { container } = render(
      <EmptyPane busy={false} folder="Week 3" onAdd={vi.fn()} onChooseVault={vi.fn()} />,
    );
    const ghost = container.querySelector(".pixel-ghost");

    // 12 rows, none of them blank, so a sprite that silently lost a row would show.
    expect(ghost?.getAttribute("viewBox")).toBe("0 0 12 12");
    expect(new Set([...(ghost?.querySelectorAll("rect") ?? [])].map((r) => r.getAttribute("y"))).size).toBe(12);
  });
});

describe("where things go", () => {
  it("names the folder anything added will go into", () => {
    render(<EmptyPane busy={false} folder="Week 3" onAdd={vi.fn()} onChooseVault={vi.fn()} />);

    expect(screen.getByText("Week 3").tagName).toBe("STRONG");
  });
});
