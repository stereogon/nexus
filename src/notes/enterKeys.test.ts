/**
 * Enter in formatted words keeps the marks with the words: past the closing marks at the
 * end, before the opening ones at the start, and closed and opened again in the middle.
 */
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, type Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { enterInFormat } from "./enterKeys";
import { parsedWhole } from "./language";

/** `doc`, `|` marking the cursor, after Enter; `null` if Enter was left to Markdown's own. */
function enter(marked: string): string | null {
  const at = marked.indexOf("|");
  const state = parsedWhole(
    EditorState.create({
      doc: marked.replace("|", ""),
      selection: { anchor: at },
      extensions: markdown({ base: markdownLanguage }),
    }),
  );
  const made: Transaction[] = [];

  const ran = enterInFormat({ state, dispatch: (transaction) => made.push(transaction) });
  const done = made[0];

  if (!ran || done === undefined) {
    return null;
  }

  const doc = done.state.doc.toString();
  const head = done.state.selection.main.head;

  return `${doc.slice(0, head)}|${doc.slice(head)}`;
}

describe("Enter in formatted words", () => {
  // The space after the words is dropped at the new line, as Enter drops it anywhere.
  it("at the end of bold words, takes the closing marks with the words", () => {
    expect(enter("A **bold|** words")).toBe("A **bold**\n|words");
    expect(enter("**bold|**")).toBe("**bold**\n|");
  });

  it("in the middle, closes the format and opens it again on the new line", () => {
    expect(enter("**bo|ld** x")).toBe("**bo**\n**|ld** x");
    expect(enter("A ~~str|uck~~")).toBe("A ~~str~~\n~~|uck~~");
    expect(enter("==ke|y=={exam}")).toBe("==ke=={exam}\n==|y=={exam}");
  });

  it("splits formats inside one another, innermost closed first", () => {
    expect(enter("**_fe|d_**")).toBe("**_fe_**\n**_|d_**");
    expect(enter("**_fed|_** after")).toBe("**_fed_**\n|after");
  });

  it("at the start of the words, leaves the marks with them on the new line", () => {
    expect(enter("A **|bold**")).toBe("A \n|**bold**");
  });

  it("continues a list as Markdown's Enter does", () => {
    expect(enter("- **milk|**")).toBe("- **milk**\n- |");
  });

  it("leaves plain words and code to Markdown's Enter", () => {
    expect(enter("plain wo|rds")).toBeNull();
    expect(enter("A **bold** an|d")).toBeNull();
    expect(enter("```\n**co|de**\n```")).toBeNull();
  });
});
