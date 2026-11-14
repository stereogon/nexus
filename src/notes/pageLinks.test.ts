// @vitest-environment jsdom
/**
 * Page links: the line `lecture_core::page_link` writes, read back, written over the line
 * `/page` was chosen on, and taken out when their page is deleted.
 */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import pagesFixture from "../../fixtures/pages.json";
import { findPreviews } from "./preview/find";
import { PAGE_LINK_LINE, linkedPages, pageLink, removePageLinks, unescapedTitle, writePageLink } from "./pageLinks";

const views: EditorView[] = [];

function viewOf(doc: string, cursor = doc.length): EditorView {
  const view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: cursor } }) });

  views.push(view);
  return view;
}

afterEach(() => {
  views.splice(0).forEach((view) => {
    view.destroy();
  });
});

describe("a page link", () => {
  it("is written exactly as Rust writes it", () => {
    // The fixture is `lecture_core::page_link`'s own output, from a title with every
    // character the link has to escape.
    const { id, title, line } = pagesFixture.link;

    expect(pageLink(id, title)).toBe(line);
  });

  it("reads back to the title it was written from", () => {
    const { title, line } = pagesFixture.link;
    const match = PAGE_LINK_LINE.exec(line);

    expect(match?.[2]).toBe("pg-1");
    expect(unescapedTitle(match?.[1] ?? "")).toBe(title);
  });

  it("is found as a page in the notes, its title unescaped", () => {
    const [found] = findPreviews(`Intro\n${pagesFixture.link.line}\nAfter`);

    expect(found).toMatchObject({ kind: "page", id: "pg-1", title: pagesFixture.link.title, from: 6 });
  });

  it("is not a page link with words after it on its line", () => {
    expect(findPreviews(`${pageLink("pg-1", "Ideas")} and more`)).toEqual([]);
  });

  it("is counted wherever it is, for the Pages panel's 'In the text'", () => {
    expect(linkedPages(`${pageLink("pg-1", "A")}\nsee [B](page://pg-2) inline`)).toEqual(new Set(["pg-1", "pg-2"]));
  });
});

describe("writing a new page's link", () => {
  it("goes over the line `/page` was chosen on, with the cursor on the line after", () => {
    const view = viewOf("Intro\n/page\n");
    const line = { from: 6, to: 11, original: "/page" };

    writePageLink(view, line, pageLink("pg-1", "Ideas"));

    expect(view.state.doc.toString()).toBe("Intro\n[Ideas](page://pg-1)\n\n");
    expect(view.state.selection.main.head).toBe(view.state.doc.line(3).from);
  });

  it("goes on a new line after the cursor's if that line changed meanwhile, over no words", () => {
    const view = viewOf("Intro\nWritten while naming", 5);

    writePageLink(view, { from: 6, to: 11, original: "/page" }, pageLink("pg-1", "Ideas"));

    expect(view.state.doc.toString()).toBe("Intro\n[Ideas](page://pg-1)\n\nWritten while naming");
  });
});

describe("deleting a page's link", () => {
  it("takes out its line and the line break with it, and leaves other lines", () => {
    const view = viewOf(`Intro\n${pageLink("pg-1", "A")}\n${pageLink("pg-2", "B")}\nEnd`);

    removePageLinks(view, new Set(["pg-1"]));

    expect(view.state.doc.toString()).toBe(`Intro\n${pageLink("pg-2", "B")}\nEnd`);
  });

  it("takes out a link on the last line with the break before it", () => {
    const view = viewOf(`Intro\n${pageLink("pg-1", "A")}`);

    removePageLinks(view, new Set(["pg-1"]));

    expect(view.state.doc.toString()).toBe("Intro");
  });

  it("changes nothing when no line links to the pages", () => {
    const view = viewOf("Intro");

    removePageLinks(view, new Set(["pg-9"]));

    expect(view.state.doc.toString()).toBe("Intro");
  });
});
