/**
 * Editing a table, as text in and text out.
 */
import { describe, expect, it } from "vitest";

import { parseTable, type Table } from "./preview/table";
import {
  blankTable,
  hasHeader,
  withAlignment,
  withCell,
  withColumn,
  withColumnMoved,
  withHeaderToggled,
  withoutColumn,
  withoutRow,
  withRow,
  withRowMoved,
  withWidth,
  writeTable,
} from "./tableModel";

function read(source: string): Table {
  const table = parseTable(source);

  if (table === null) {
    throw new Error("not a table");
  }

  return table;
}

const SOURCE = ["| Name | Votes |", "| --- | ---: |", "| Raft | 3 |", "| Paxos | 5 |"].join("\n");

describe("a table written back", () => {
  it("is tidy GFM, padded so the columns line up, and reads back the same", () => {
    const written = writeTable(read(SOURCE));

    expect(written).toBe(["| Name  | Votes |", "| ----- | ----: |", "| Raft  | 3     |", "| Paxos | 5     |"].join("\n"));
    expect(read(written)).toEqual(read(SOURCE));
  });

  it("keeps a pipe typed into a cell as text", () => {
    const written = writeTable(withCell(read(SOURCE), { row: 0, column: 0 }, "a | b"));

    expect(read(written).rows[0]?.[0]).toBe("a | b");
  });

  it("starts blank at the size chosen, the header named", () => {
    const table = blankTable(2, 3);

    expect(table.header).toEqual(["Column 1", "Column 2", "Column 3"]);
    expect(table.rows).toEqual([["", "", ""], ["", "", ""]]);
    expect(parseTable(writeTable(table))).toEqual(table);
  });
});

describe("rows and columns", () => {
  const table = read(SOURCE);

  it("are added where asked, empty", () => {
    expect(withRow(table, 1).rows.map((row) => row[0])).toEqual(["Raft", "", "Paxos"]);
    expect(withRow(table, 2).rows).toHaveLength(3);
    expect(withColumn(table, 1).header).toEqual(["Name", "Column 3", "Votes"]);
    expect(withColumn(table, 1).align).toEqual([null, null, "right"]);
    expect(withColumn(table, 2).rows[0]).toEqual(["Raft", "3", ""]);
  });

  it("are removed, except the last column", () => {
    expect(withoutRow(table, 0).rows).toEqual([["Paxos", "5"]]);
    expect(withoutColumn(table, 0).header).toEqual(["Votes"]);
    expect(withoutColumn(withoutColumn(table, 0), 0).header).toEqual(["Votes"]);
  });

  it("are moved, and stay put at an end", () => {
    expect(withRowMoved(table, 1, -1).rows.map((row) => row[0])).toEqual(["Paxos", "Raft"]);
    expect(withRowMoved(table, 1, 1)).toBe(table);
    expect(withColumnMoved(table, 0, 1).header).toEqual(["Votes", "Name"]);
    expect(withColumnMoved(table, 0, 1).align).toEqual(["right", null]);
    expect(withColumnMoved(table, 0, -1)).toBe(table);
  });

  it("are aligned, as GFM writes it", () => {
    expect(writeTable(withAlignment(table, 0, "center")).split("\n")[1]).toBe("| :---: | ----: |");
  });
});

describe("the header row", () => {
  const table = read(SOURCE);

  it("turned off, moves into the body and is written as empty cells", () => {
    const off = withHeaderToggled(table);

    expect(hasHeader(off)).toBe(false);
    expect(off.rows[0]).toEqual(["Name", "Votes"]);
    expect(read(writeTable(off))).toEqual(off);
  });

  it("turned on again, promotes the first row, so nothing typed is lost", () => {
    expect(withHeaderToggled(withHeaderToggled(table))).toEqual(table);
  });

  it("stays off for a column added to a table without one", () => {
    expect(hasHeader(withColumn(withHeaderToggled(table), 0))).toBe(false);
  });
});

describe("column widths", () => {
  const table = read(SOURCE);

  it("are not written while every column fits its words", () => {
    expect(table.widths).toEqual([null, null]);
    expect(writeTable(table)).not.toContain("<!--");
  });

  it("are written on the line above the table, and read back the same", () => {
    const sized = withWidth(table, 1, 180.4);
    const written = writeTable(sized);

    expect(written.split("\n")[0]).toBe("<!-- column widths: auto 180 -->");
    expect(read(written)).toEqual(sized);
  });

  it("are held to what a column can be, and put back to fitting with null", () => {
    expect(withWidth(table, 0, 5).widths[0]).toBe(72);
    expect(withWidth(table, 0, 99999).widths[0]).toBe(1600);
    expect(withWidth(withWidth(table, 0, 200), 0, null)).toEqual(table);
  });

  it("move, and go, with their column", () => {
    const sized = withWidth(table, 0, 200);

    expect(withColumnMoved(sized, 0, 1).widths).toEqual([null, 200]);
    expect(withoutColumn(sized, 0).widths).toEqual([null]);
    expect(withColumn(sized, 0).widths).toEqual([null, 200, null]);
  });

  it("read from a hand-written line, a stray word fitting its words and missing columns too", () => {
    expect(read(`<!-- column widths: 150 wide -->\n${SOURCE}`).widths).toEqual([150, null]);
    expect(read(`<!--column widths: 150-->\n${SOURCE}`).widths).toEqual([150, null]);
  });
});
