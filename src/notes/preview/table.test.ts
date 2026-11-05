// @vitest-environment jsdom
/**
 * Reading a GitHub-style table, and drawing its cells as elements rather than HTML.
 */
import { describe, expect, it } from "vitest";

import { appendInline, cellsOf, parseTable, TableWidget } from "./table";

describe("a table's text", () => {
  it("reads the header, the alignment and the rows", () => {
    expect(parseTable("| Algo | Year |\n|:--|--:|\n| Raft | 2014 |\n| Paxos | 1998 |")).toEqual({
      header: ["Algo", "Year"],
      align: ["left", "right"],
      rows: [
        ["Raft", "2014"],
        ["Paxos", "1998"],
      ],
    });
  });

  it("reads centre alignment and no alignment", () => {
    expect(parseTable("a | b\n:-: | ---\n1 | 2")?.align).toEqual(["center", null]);
  });

  it("pads a short row and drops extra cells, as GFM does", () => {
    expect(parseTable("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |")?.rows).toEqual([
      ["1", ""],
      ["1", "2"],
    ]);
  });

  it("keeps an escaped pipe as text inside its cell", () => {
    expect(cellsOf("| a \\| b | c |")).toEqual(["a | b", "c"]);
  });

  it("is not a table without a delimiter row", () => {
    expect(parseTable("| a | b |\n| 1 | 2 |")).toBeNull();
  });
});

describe("a cell", () => {
  it("draws bold, italic and code as elements", () => {
    const cell = document.createElement("td");

    appendInline(cell, "a **b** *c* `d` e");

    expect(cell.innerHTML).toBe("a <strong>b</strong> <em>c</em> <code>d</code> e");
  });

  it("can only ever hold text, whatever is typed into it", () => {
    // Built as nodes, so markup in a cell is shown, not run.
    const cell = document.createElement("td");

    appendInline(cell, '<img src=x onerror="alert(1)">');

    expect(cell.querySelector("img")).toBeNull();
    expect(cell.textContent).toBe('<img src=x onerror="alert(1)">');
  });
});

describe("the drawn table", () => {
  it("has a header row and a row per line, aligned as written", () => {
    const source = "| A | B |\n|---|--:|\n| 1 | 2 |";
    const table = parseTable(source);

    if (table === null) {
      throw new Error("the fixture is a table");
    }

    const element = new TableWidget(source, table).toDOM();

    expect([...element.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual(["A", "B"]);
    expect(element.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(element.querySelectorAll("td")[1]?.style.textAlign).toBe("right");
  });
});
