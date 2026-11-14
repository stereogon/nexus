/**
 * Links to pages (2026-11-14): `[Title](page://<id>)` on a line of its own, drawn as the
 * page's row in the note it lives in (`preview/pageLinkWidget.ts`).
 *
 * The line is a twin of `lecture_core::page_link`, as `citation.ts` is of `citation_block`:
 * built here too so the editor can write one without a round trip, and held to it by
 * `pageLinks.test.ts`. The id alphabet is `PageId`'s, which is `AnnotationId`'s.
 */
import { Facet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** The scheme a page link is written under. */
export const PAGE_SCHEME = "page://";

/** A line that is a page link and nothing else; the title is still escaped. */
export const PAGE_LINK_LINE = /^\[((?:\\.|[^\]\\])+)\]\(page:\/\/([A-Za-z0-9_-]+)\)\s*$/u;

/** `[Title](page://<id>)`, with what would end the link text early escaped. */
export function pageLink(id: string, title: string): string {
  return `[${title.replace(/[\\[\]]/g, (character) => `\\${character}`)}](${PAGE_SCHEME}${id})`;
}

/** A link's title as written, with the escaping `pageLink` added taken off again. */
export function unescapedTitle(written: string): string {
  return written.replace(/\\([\\[\]])/g, "$1");
}

/** The ids of the pages `text` links to, wherever on a line. */
export function linkedPages(text: string): Set<string> {
  return new Set([...text.matchAll(/page:\/\/([A-Za-z0-9_-]+)/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])));
}

/** The line a new page's link goes on, as it read when `/page` was chosen. */
export interface PageLine {
  readonly from: number;
  readonly to: number;
  readonly original: string;
}

/** How the editor asks for a new page's name; none in an editor without pages. */
export const pageMaker = Facet.define<(line: PageLine) => void, ((line: PageLine) => void) | null>({
  combine: (makers) => makers[0] ?? null,
});

/**
 * Writes `link` over `line`, the line `/page` was chosen on, and puts the cursor on the
 * line after it, so writing carries on below. If the line changed while the page was being
 * named, the link goes on a new line after the cursor's instead, rather than over words.
 */
export function writePageLink(view: EditorView, line: PageLine, link: string): void {
  const doc = view.state.doc;
  const unchanged = line.to <= doc.length && view.state.sliceDoc(line.from, line.to) === line.original;
  const cursorLine = doc.lineAt(view.state.selection.main.head);
  const from = unchanged ? line.from : cursorLine.to;
  const to = unchanged ? line.to : cursorLine.to;
  const insert = `${unchanged ? "" : "\n"}${link}\n`;

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
    userEvent: "input.page",
  });
  view.focus();
}

/** Takes out every line that is a link to one of `ids`, as a deleted page's link goes. */
export function removePageLinks(view: EditorView, ids: ReadonlySet<string>): void {
  const doc = view.state.doc;
  const changes: { from: number; to: number }[] = [];

  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number);
    const id = PAGE_LINK_LINE.exec(line.text)?.[2];

    if (id !== undefined && ids.has(id)) {
      // With its line break, so no blank line is left where it was.
      changes.push(number < doc.lines ? { from: line.from, to: line.to + 1 } : { from: Math.max(0, line.from - 1), to: line.to });
    }
  }

  if (changes.length > 0) {
    view.dispatch({ changes, userEvent: "delete.page" });
  }
}
