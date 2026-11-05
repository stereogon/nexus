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

  // Line-level styles for the live preview, here rather than in a stylesheet: CodeMirror's
  // own `.cm-line` padding is injected after the app's CSS and would win there.
  ".md-quote": {
    borderLeft: "3px solid var(--border-strong)",
    paddingLeft: "14px",
    color: "var(--text-secondary)",
  },
  // A fenced code block reads as one panel: the lines share a background and side borders,
  // and the first and last — the fences, hidden while the cursor is elsewhere — round it off.
  ".md-code-line": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.84em",
    lineHeight: "1.65",
    backgroundColor: "var(--code-bg)",
    borderLeft: "1px solid var(--code-border)",
    borderRight: "1px solid var(--code-border)",
    padding: "0 18px",
  },
  ".md-code-first": {
    borderTop: "1px solid var(--code-border)",
    borderTopLeftRadius: "10px",
    borderTopRightRadius: "10px",
    paddingTop: "6px",
    marginTop: "6px",
    color: "var(--text-faint)",
  },
  ".md-code-last": {
    borderBottom: "1px solid var(--code-border)",
    borderBottomLeftRadius: "10px",
    borderBottomRightRadius: "10px",
    paddingBottom: "6px",
    marginBottom: "6px",
    color: "var(--text-faint)",
  },
  ".md-code-lang": {
    float: "right",
    fontFamily: "var(--font-ui)",
    fontSize: "11px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-faint)",
  },
  ".md-table-source": { fontFamily: "var(--font-mono)", fontSize: "0.86em" },
  ".md-inline-code": {
    backgroundColor: "var(--code-bg)",
    border: "1px solid var(--code-border)",
    borderRadius: "5px",
    padding: "1px 4px",
  },

  // The line a jump from the document landed on, lit for a moment (§2.4). Two names that
  // alternate (`flash.ts`), because an animation restarts only when its name changes.
  ".md-flash-a": { animation: "md-flash-a 1.6s ease-out 1" },
  ".md-flash-b": { animation: "md-flash-b 1.6s ease-out 1" },
  "@keyframes md-flash-a": {
    "0%, 25%": { backgroundColor: "var(--accent-soft)" },
    "100%": { backgroundColor: "transparent" },
  },
  "@keyframes md-flash-b": {
    "0%, 25%": { backgroundColor: "var(--accent-soft)" },
    "100%": { backgroundColor: "transparent" },
  },
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
  // Mono type only: the chip behind inline code is `.md-inline-code`, from the syntax tree.
  // On this tag it also landed on the text inside fenced blocks, which share it, and drew
  // a chip within the code panel (seen in a screenshot, 2026-11-05).
  { tag: tags.monospace, fontFamily: "var(--font-mono)", fontSize: "0.88em" },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: "var(--text-faint)", fontFamily: "var(--font-mono)", fontWeight: "400", fontStyle: "normal", fontSize: "0.85em" },
  { tag: tags.list, color: "var(--text-secondary)" },

  // Code, inside fenced blocks in a language the notes know (`codeLanguages.ts`).
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], color: "var(--code-keyword)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--code-string)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--code-number)" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--code-function)" },
  { tag: [tags.typeName, tags.className, tags.tagName], color: "var(--code-type)" },
  { tag: [tags.attributeName, tags.propertyName], color: "var(--code-function)" },
]);

/** Everything about the notes' appearance, as one extension. */
export const notesAppearance = [editorTheme, syntaxHighlighting(markdownStyle)];
