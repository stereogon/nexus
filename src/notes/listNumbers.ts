/**
 * A numbered list's numbers (2026-11-14, at the user's request: "someone can do 1.a 1.b").
 *
 * Drawn the way Markdown renderers and Notion count, from the list's shape rather than the
 * digits written: an item's number is its place in its list, from the first item's number
 * for a list at the top and from 1 for one nested in an item. The top level is counted
 * 1, 2, 3; the next a, b, c; the one below i, ii, iii. Markdown has only digits, so the file
 * keeps `1.` and `2.` at every level, and `renumbered` brings its digits in line when Tab
 * moves lines between levels.
 */
import { syntaxTree } from "@codemirror/language";
import type { ChangeSpec, EditorState } from "@codemirror/state";

/** A node of the Markdown tree; named through `syntaxTree`, as Lezer is not a direct dependency. */
type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

function roman(number: number): string {
  let left = number;
  let written = "";

  for (const [value, letters] of ROMAN) {
    for (; left >= value; left -= value) {
      written += letters;
    }
  }

  return written;
}

/** a … z, then aa, ab …, as spreadsheets name columns. */
function letters(number: number): string {
  let left = number;
  let written = "";

  for (; left > 0; left = Math.floor((left - 1) / 26)) {
    written = String.fromCharCode(97 + ((left - 1) % 26)) + written;
  }

  return written;
}

/** How the `number`th item of a list `depth` lists deep is labelled: `3.`, `c.` or `iii.`. */
export function listLabel(number: number, depth: number): string {
  const level = depth % 3;

  return `${level === 0 ? String(number) : level === 1 ? letters(number) : roman(number)}.`;
}

/** The digits a list item's mark is written with, or `null` for a bullet. */
function writtenNumber(state: EditorState, item: SyntaxNode): number | null {
  const mark = item.getChild("ListMark");
  const digits = mark === null ? null : /^\d+/.exec(state.doc.sliceString(mark.from, mark.to));

  return digits === null ? null : Number(digits[0]);
}

/** How many lists `list` sits inside, 0 for one at the top. */
function depthOf(list: SyntaxNode): number {
  let depth = 0;

  for (let at = list.parent; at !== null; at = at.parent) {
    if (at.name === "BulletList" || at.name === "OrderedList") {
      depth += 1;
    }
  }

  return depth;
}

/** The number item `item` of an ordered list should have: its place, counted as above. */
export function itemNumber(state: EditorState, item: SyntaxNode): number {
  const list = item.parent;
  let place = 0;

  for (let before = item.prevSibling; before !== null; before = before.prevSibling) {
    if (before.name === "ListItem") {
      place += 1;
    }
  }

  const first = list?.getChild("ListItem") ?? null;
  const start = list === null || first === null || depthOf(list) > 0 ? 1 : (writtenNumber(state, first) ?? 1);

  return start + place;
}

/** The changes that write every numbered item's digits as `itemNumber` counts them. */
export function renumbered(state: EditorState): ChangeSpec[] {
  const changes: ChangeSpec[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "ListItem" || node.node.parent?.name !== "OrderedList") {
        return;
      }

      const mark = node.node.getChild("ListMark");
      const written = writtenNumber(state, node.node);
      const wanted = itemNumber(state, node.node);

      if (mark !== null && written !== null && written !== wanted) {
        const digits = /^\d+/.exec(state.doc.sliceString(mark.from, mark.to))?.[0].length ?? 0;

        changes.push({ from: mark.from, to: mark.from + digits, insert: String(wanted) });
      }
    },
  });

  return changes;
}
