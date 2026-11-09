/**
 * Pasting text into the notes (2026-11-09), as Notion does: formatting copied from a web
 * page or a document arrives as Markdown (`htmlToMarkdown.ts`) rather than as plain text.
 * Inside code, what was copied is pasted plain, since code is an example and its marks
 * would be text there. An image on the clipboard is `pasteImage.ts`'s, which comes first.
 *
 * A web address pasted over selected words already makes them a link: that is
 * `@codemirror/lang-markdown`'s `pasteURLAsLink`, on by default, so it is not done twice
 * here (found when the journey for it passed with this handler switched off).
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { htmlToMarkdown } from "./htmlToMarkdown";

function inCode(state: EditorState, at: number): boolean {
  for (let node = syntaxTree(state).resolveInner(at, -1); ; ) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" || node.name === "InlineCode") {
      return true;
    }

    const parent = node.parent;

    if (parent === null) {
      return false;
    }

    node = parent;
  }
}

/** What pasting `plain` and `html` at `from` writes, or `null` for the editor's own paste. */
export function pasted(state: EditorState, from: number, plain: string, html: string): string | null {
  if (html.trim() === "" || inCode(state, from)) {
    return null;
  }

  const markdown = htmlToMarkdown(html);

  // Nothing the plain text did not already say: the editor's own paste keeps line breaks
  // exactly as copied.
  return markdown === "" || markdown === plain.trim() ? null : markdown;
}

export const richPaste = EditorView.domEventHandlers({
  paste(event, view) {
    const data = event.clipboardData;

    if (data === null || [...data.files].some((file) => file.type.startsWith("image/"))) {
      return false;
    }

    const { from, to } = view.state.selection.main;
    const text = pasted(view.state, from, data.getData("text/plain"), data.getData("text/html"));

    if (text === null) {
      return false;
    }

    event.preventDefault();
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true, userEvent: "input.paste" });

    return true;
  },
});
