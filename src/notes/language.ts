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
import type { Extension } from "@codemirror/state";

import { codeLanguages } from "./codeLanguages";

export const notesMarkdown: Extension = markdown({ base: markdownLanguage, codeLanguages, extensions: { remove: ["SetextHeading"] } });
