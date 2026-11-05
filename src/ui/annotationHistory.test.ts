/**
 * The rules of undo and redo for annotations: which step moves, and to what.
 */
import { describe, expect, it } from "vitest";

import type { Annotation } from "../ipc/annotations";
import { HISTORY_LIMIT, NO_HISTORY, recorded, redone, toward, undone, type Step } from "./annotationHistory";

const KEY: Annotation = {
  kind: "textHighlight",
  id: "hl-1",
  page: 2,
  semantic: "key",
  quote: "Raft achieves consensus.",
  rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
  createdAt: "2026-10-27T16:00:00Z",
  updatedAt: "2026-10-27T16:00:00Z",
};

const NOTE: Annotation = {
  kind: "textBox",
  id: "tb-1",
  page: 2,
  region: { x: 0.5, y: 0.5, width: 0.2, height: 0.1 },
  text: "exam formula",
  createdAt: "2026-10-27T16:00:00Z",
  updatedAt: "2026-10-27T16:00:00Z",
};

const ADDED: Step = { before: null, after: KEY };
const RETAGGED: Step = { before: KEY, after: { ...KEY, semantic: "exam" } };

describe("the stacks", () => {
  it("takes back the newest change first", () => {
    const history = recorded(recorded(NO_HISTORY, ADDED), RETAGGED);

    expect(undone(history)?.step).toBe(RETAGGED);
  });

  it("does again what was just taken back", () => {
    const after = undone(recorded(NO_HISTORY, ADDED));

    expect(after?.history.past).toEqual([]);
    expect(after === null ? null : redone(after.history)?.step).toBe(ADDED);
  });

  it("forgets what could be redone once something new is done", () => {
    const back = undone(recorded(NO_HISTORY, ADDED));

    expect(back === null ? null : recorded(back.history, RETAGGED).future).toEqual([]);
  });

  it("has nothing to take back or do again at the start", () => {
    expect(undone(NO_HISTORY)).toBeNull();
    expect(redone(NO_HISTORY)).toBeNull();
  });

  it("keeps a bounded number of steps, dropping the oldest", () => {
    let history = NO_HISTORY;

    for (let index = 0; index <= HISTORY_LIMIT; index += 1) {
      history = recorded(history, index === 0 ? ADDED : RETAGGED);
    }

    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toBe(RETAGGED);
  });
});

describe("the move toward a state", () => {
  it("takes back an addition by removing it", () => {
    expect(toward(KEY, null)).toEqual({ kind: "remove", id: "hl-1" });
  });

  it("takes back a removal by putting the same annotation back, keeping its id", () => {
    expect(toward(null, KEY)).toEqual({ kind: "restore", annotation: KEY });
  });

  it("takes back a re-mark by marking it as it was", () => {
    expect(toward(RETAGGED.after, KEY)).toEqual({ kind: "retag", id: "hl-1", semantic: "key" });
  });

  it("takes back a move or a reword of a sticky note by putting both back", () => {
    const moved: Annotation = { ...NOTE, region: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, text: "x" };

    expect(toward(moved, NOTE)).toEqual({
      kind: "rebox",
      id: "tb-1",
      edit: { region: NOTE.region, text: "exam formula" },
    });
  });

  it("has nothing to do between two absences", () => {
    expect(toward(null, null)).toBeNull();
  });
});
