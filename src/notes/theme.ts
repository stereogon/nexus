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
    // The whole pane, so the measure below is centred in it with margins either side. As a
    // flex child it shrank to its own measure and sat at the left, its scrollbar halfway
    // across the pane (reported 2026-11-07).
    flex: "1 1 auto",
    minWidth: "0",
    color: "var(--text)",
    backgroundColor: "var(--surface)",
  },
  "&.cm-focused": { outline: "none" },
  // A thin, quiet scrollbar, as the window's lists have (`shell.css`), rather than a full
  // bar drawn down the pane (reported 2026-11-07).
  ".cm-scroller::-webkit-scrollbar": { width: "10px" },
  ".cm-scroller::-webkit-scrollbar-thumb": {
    border: "3px solid transparent",
    borderRadius: "10px",
    background: "var(--border) padding-box",
  },
  ".cm-scroller::-webkit-scrollbar-thumb:hover": { background: "var(--text-faint) padding-box" },
  ".cm-scroller": {
    fontFamily: "var(--font-prose)",
    fontSize: "16px",
    lineHeight: "1.7",
  },
  ".cm-content": {
    // A reading measure: long lines of prose are hard to track back across.
    maxWidth: "68ch",
    margin: "0 auto",
    // Deeper on the left, for the + and ⋮⋮ handle beside each line (`BlockHandles`).
    padding: "28px 32px 40vh 56px",
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
  // A fenced code block reads as one panel: the code lines share a background and side
  // borders, between the header above and the foot below (drawn in place of the fences).
  ".md-code-line": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.84em",
    lineHeight: "1.65",
    backgroundColor: "var(--code-bg)",
    borderLeft: "1px solid var(--code-border)",
    borderRight: "1px solid var(--code-border)",
    padding: "0 18px",
  },
  // The code block's header (2026-11-07): the language menu at the left, Copy at the right,
  // on the panel's first line, as Notion has them.
  ".md-code-head": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    // No margin: the editor measures a block widget's own box (see `.md-page-head`).
    padding: "6px 10px 2px",
    backgroundColor: "var(--code-bg)",
    border: "1px solid var(--code-border)",
    borderBottom: "none",
    borderTopLeftRadius: "10px",
    borderTopRightRadius: "10px",
  },
  // A callout (2026-11-09): one tinted box, its head in place of the `[!NOTE]` line, its
  // colour the meaning's own — the four highlight colours and the accent, so a theme that
  // swaps a highlight colour swaps the callout's too.
  ".md-callout-note": { "--callout": "var(--semantic-question)", "--callout-wash": "var(--highlight-question)" },
  ".md-callout-tip": { "--callout": "var(--semantic-definition)", "--callout-wash": "var(--highlight-definition)" },
  ".md-callout-important": { "--callout": "var(--accent)", "--callout-wash": "var(--accent-soft)" },
  ".md-callout-warning": { "--callout": "var(--semantic-key)", "--callout-wash": "var(--highlight-key)" },
  ".md-callout-caution": { "--callout": "var(--semantic-exam)", "--callout-wash": "var(--highlight-exam)" },
  ".md-callout-top": { paddingTop: "10px" },
  ".md-callout-head": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 14px 2px",
    backgroundColor: "var(--callout-wash)",
    borderLeft: "3px solid var(--callout)",
    borderTopRightRadius: "8px",
    fontFamily: "var(--font-ui)",
    fontSize: "13px",
    fontWeight: "600",
    color: "var(--text)",
  },
  ".md-callout-alone .md-callout-head": { paddingBottom: "8px", borderBottomRightRadius: "8px" },
  ".md-callout-alone": { paddingBottom: "12px" },
  ".md-callout-icon": { color: "var(--callout)" },
  ".md-callout-head .md-callout-kind": { color: "var(--text)", fontWeight: "600", paddingLeft: "0" },
  ".md-callout-line": {
    backgroundColor: "var(--callout-wash)",
    borderLeft: "3px solid var(--callout)",
    padding: "0 14px",
  },
  ".md-callout-end": { paddingBottom: "8px", borderBottomRightRadius: "8px" },
  // Room around a code block, as padding on boxes of their own (never margins, which the
  // editor would not count when placing the lines after the block).
  ".md-code-top": { paddingTop: "10px" },
  ".md-code-bottom": { paddingBottom: "12px" },
  // Headings with room above them, more for a larger one, as Notion spaces them. Padding on
  // the line itself, which the editor measures.
  ".md-h1": { paddingTop: "0.9em" },
  ".md-h2": { paddingTop: "0.7em" },
  ".md-h3, .md-h4, .md-h5, .md-h6": { paddingTop: "0.5em" },
  // The panel's foot, in place of the closing fence. Padding and border only: a block
  // widget's own box is what the editor measures, so no margin outside it.
  ".md-code-foot": {
    height: "10px",
    backgroundColor: "var(--code-bg)",
    border: "1px solid var(--code-border)",
    borderTop: "none",
    borderBottomLeftRadius: "10px",
    borderBottomRightRadius: "10px",
  },
  ".md-code-lang, .md-code-copy, .md-callout-kind": {
    height: "24px",
    padding: "0 6px",
    border: "none",
    borderRadius: "6px",
    background: "transparent",
    color: "var(--text-meta)",
    fontFamily: "var(--font-ui)",
    fontSize: "12px",
    cursor: "pointer",
  },
  ".md-code-lang:hover, .md-code-copy:hover, .md-callout-kind:hover": {
    background: "var(--track)",
    color: "var(--text)",
  },
  // The notes' title and the line under it (`pageHeading`), as the canvas draws them.
  // Padding, never margin: the editor measures a block widget's own box to place the lines
  // after it, and a margin outside it put every click below the title a line off (found by
  // the formatting journeys, 2026-11-07).
  ".md-page-head": { paddingBottom: "26px" },
  ".md-page-title": {
    margin: "0",
    fontFamily: "var(--font-prose)",
    fontSize: "2em",
    fontWeight: "600",
    lineHeight: "1.2",
    color: "var(--text)",
  },
  ".md-page-meta": {
    margin: "6px 0 0",
    fontFamily: "var(--font-ui)",
    fontSize: "12px",
    color: "var(--text-meta)",
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

/**
 * A plain note's page, over `notesAppearance`: as the redesign canvas draws "Monday
 * plans", the writing is the whole pane, so it sits in a wider centred column, a little
 * larger, with room above it. Beside a document the narrower measure stays.
 */
export const notePage = EditorView.theme({
  ".cm-scroller": { fontSize: "17px" },
  ".cm-content": { maxWidth: "680px", paddingTop: "48px" },
});
