// @vitest-environment jsdom
/**
 * What is copied from the web or a document, as Markdown.
 */
import { describe, expect, it } from "vitest";

import { htmlToMarkdown } from "./htmlToMarkdown";

describe("pasted formatting", () => {
  it("keeps headings, paragraphs and the marks inside them", () => {
    expect(htmlToMarkdown("<h2>Plan</h2><p>Some <b>bold</b>, <em>italic</em>, <s>gone</s> and <code>x</code>.</p>")).toBe(
      "## Plan\n\nSome **bold**, _italic_, ~~gone~~ and `x`.",
    );
  });

  it("keeps a web link, and only the words of any other", () => {
    expect(htmlToMarkdown('<p><a href="https://raft.github.io">Raft</a> and <a href="javascript:alert(1)">this</a></p>')).toBe(
      "[Raft](https://raft.github.io) and this",
    );
  });

  it("writes lists, nested and to-do, and numbered ones", () => {
    expect(htmlToMarkdown("<ul><li>milk<ul><li>oat</li></ul></li><li>eggs</li></ul>")).toBe("- milk\n  - oat\n- eggs");
    expect(htmlToMarkdown("<ol><li>one</li><li>two</li></ol>")).toBe("1. one\n2. two");
    expect(htmlToMarkdown('<ul><li><input type="checkbox" checked>done</li></ul>')).toBe("- [x] done");
  });

  it("writes code blocks with their language, quotes, dividers and tables", () => {
    expect(htmlToMarkdown('<pre><code class="language-ts">let a = 1;\n</code></pre>')).toBe("```ts\nlet a = 1;\n```");
    expect(htmlToMarkdown("<blockquote><p>wise</p></blockquote><hr>")).toBe("> wise\n\n---");
    expect(htmlToMarkdown("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>")).toBe(
      "| A   | B   |\n| --- | --- |\n| 1   | 2   |",
    );
  });

  it("reads Google Docs' bold, marked by style inside a wrapper that is not bold", () => {
    const docs = '<b style="font-weight:normal" id="docs-internal-guid-1"><p><span style="font-weight:700">Key</span> idea</p></b>';

    expect(htmlToMarkdown(docs)).toBe("**Key** idea");
  });

  it("leaves images out, and never runs what it reads", () => {
    expect(htmlToMarkdown('<p>See <img src="https://x/y.png" onerror="alert(1)"> this<script>alert(2)</script></p>')).toBe("See this");
  });
});
