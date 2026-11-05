/**
 * How the notes look: prose type, Markdown styling, and the citation chip.
 *
 * Through CodeMirror's own theme and highlighting rather than plain CSS, which is the
 * reason the notes first rendered in monospace (reported 2026-11-05: "the font in the
 * notes section is bad"). CodeMirror injects its base theme at runtime, after the app's
 * stylesheets, so a `.cm-scroller { font-family }` rule of ours lost to its monospace one
 * at equal specificity. `EditorView.theme` is scoped and ordered by CodeMirror itself.
 *
 * Values come from the design tokens as CSS variables, so both themes follow without a
 * second set. Literata for prose and Bricolage for headings are CLAUDE.md §3's type
 * roles; Plex Mono for code and the markup characters, which are dimmed so the words read
 * first and the syntax second.
 */
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text)",
    backgroundColor: "var(--surface)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-prose)",
    fontSize: "16px",
    lineHeight: "1.7",
  },
  ".cm-content": {
    // A reading measure: long lines of prose are hard to track back across.
    maxWidth: "68ch",
    margin: "0 auto",
    padding: "28px 32px 40vh",
    caretColor: "var(--accent)",
  },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--text-faint)", fontStyle: "italic" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-soft)",
  },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
});

/** Markdown, styled. Markup characters are dimmed rather than hidden, so they stay editable. */
const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontFamily: "var(--font-brand)", fontSize: "1.65em", fontWeight: "700", lineHeight: "1.3" },
  { tag: tags.heading2, fontFamily: "var(--font-brand)", fontSize: "1.35em", fontWeight: "650", lineHeight: "1.35" },
  { tag: tags.heading3, fontFamily: "var(--font-brand)", fontSize: "1.15em", fontWeight: "600" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontFamily: "var(--font-brand)", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "650" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--text-meta)", fontFamily: "var(--font-mono)", fontSize: "0.85em" },
  { tag: tags.quote, color: "var(--text-secondary)", fontStyle: "italic" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)", fontSize: "0.88em", backgroundColor: "var(--track)", borderRadius: "4px" },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: "var(--text-faint)", fontFamily: "var(--font-mono)", fontWeight: "400", fontStyle: "normal", fontSize: "0.85em" },
  { tag: tags.list, color: "var(--text-faint)" },
]);

/** Everything about the notes' appearance, as one extension. */
export const notesAppearance = [editorTheme, syntaxHighlighting(markdownStyle)];
