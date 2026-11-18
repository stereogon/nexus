/**
 * The Markdown the notes are read as: GitHub-flavoured, with code blocks in the languages the
 * notes know (`codeLanguages.ts`), and without setext headings.
 *
 * A setext heading is a line underlined by a line of `-` or `=` alone. Typing a bullet under
 * a line of text passes through exactly that, `-`, and the line above was drawn as a heading
 * until the bullet had words (reported 2026-11-14). The notes only ever write `#` headings,
 * so the underlined form goes: `---` under text is a rule, as it is after a blank line, and
 * a lone `=` is text. Moved out of `notesExtensions.ts` the same day so tests parse as the
 * editor does.
 */
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";

import { codeLanguages } from "./codeLanguages";

export const notesMarkdown: Extension = markdown({ base: markdownLanguage, codeLanguages, extensions: { remove: ["SetextHeading"] } });

/**
 * `state` with its syntax tree parsed to the end, given up to `timeout` ms, so that
 * `syntaxTree` read from it sees the whole document (2026-11-18).
 *
 * `ensureSyntaxTree` alone is not that. It parses further in the state's parse context and
 * returns the tree, but `syntaxTree(state)` still answers with the tree the state was made
 * with, parsed in CodeMirror's 20 ms budget — whole on a fast machine, cut short on a slow
 * one. A transaction is where a state takes up its context's newer tree, so an empty one
 * hands back the same document with the tree complete. Found when a list's labels test
 * failed on a busy CI runner, having seen only the first item.
 */
export function parsedWhole(state: EditorState, timeout = 5000): EditorState {
  ensureSyntaxTree(state, state.doc.length, timeout);

  return state.update({}).state;
}
