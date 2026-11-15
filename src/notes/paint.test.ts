/**
 * Coloured words, as Notion writes them: found in a line, and painted, repainted and
 * unpainted.
 */
import { describe, expect, it } from "vitest";

import { paintChanges, painted, paintsIn } from "./paint";

/** `doc` with `changes` applied, last first so the offsets hold. */
function applied(doc: string, changes: readonly { from: number; to: number; insert: string }[]): string {
  return [...changes].reverse().reduce((text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to), doc);
}

function paintingWords(doc: string, words: string, paint: Parameters<typeof paintChanges>[3]): string {
  const from = doc.indexOf(words);

  return applied(doc, paintChanges(doc, from, from + words.length, paint));
}

describe("coloured words", () => {
  it("are found with their words and their colour, text or background", () => {
    const line = 'A <span color="red">warning</span> and <span color="yellow_bg">a note</span>.';
    const [first, second] = paintsIn(line, 10);

    expect(first).toMatchObject({ paint: { colour: "red", background: false } });
    expect(line.slice((first?.innerFrom ?? 0) - 10, (first?.innerTo ?? 0) - 10)).toBe("warning");
    expect(second).toMatchObject({ paint: { colour: "yellow", background: true } });
    expect(line.slice((second?.innerFrom ?? 0) - 10, (second?.innerTo ?? 0) - 10)).toBe("a note");
  });

  it("are only Notion's colours, closed on the same line", () => {
    expect(paintsIn('<span color="teal">x</span>')).toEqual([]);
    expect(paintsIn('<span color="red">open')).toEqual([]);
    expect(paintsIn('<span style="color: red">x</span>')).toEqual([]);
  });

  it("are written as Notion writes them", () => {
    expect(painted("slow start", { colour: "blue", background: false })).toBe('<span color="blue">slow start</span>');
    expect(painted("AIMD", { colour: "yellow", background: true })).toBe('<span color="yellow_bg">AIMD</span>');
  });

  it("wraps the selection, trimmed, a line at a time", () => {
    expect(paintingWords("TCP slow start wins", "slow start", { colour: "blue", background: false })).toBe(
      'TCP <span color="blue">slow start</span> wins',
    );
    expect(paintingWords("one\n two \nthree", "one\n two ", { colour: "red", background: false })).toBe(
      '<span color="red">one</span>\n <span color="red">two</span> \nthree',
    );
  });

  it("repaints a span chosen again, text to background included, and unwraps it on Default", () => {
    const doc = 'TCP <span color="blue">slow start</span> wins';

    expect(paintingWords(doc, "slow", { colour: "red", background: false })).toBe('TCP <span color="red">slow start</span> wins');
    expect(paintingWords(doc, "slow start", { colour: "blue", background: true })).toBe('TCP <span color="blue_bg">slow start</span> wins');
    expect(paintingWords(doc, "start", null)).toBe("TCP slow start wins");
  });

  it("does nothing for Default outside a span", () => {
    expect(paintChanges("plain words", 0, 5, null)).toEqual([]);
  });
});
