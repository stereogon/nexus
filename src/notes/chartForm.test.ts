/**
 * The chart form's table, to the chart block's JSON and back.
 */
import { describe, expect, it } from "vitest";

import { pastedGrid, sourceOf, STARTER, tableOf, withColumn, withoutColumn, withSeries, type ChartTable } from "./chartForm";
import { readChart } from "./preview/chartSpec";

function written(table: ChartTable): string {
  const result = sourceOf(table);

  if (!result.ok) {
    throw new Error(result.problem);
  }

  return result.source;
}

describe("the chart form's table", () => {
  it("writes JSON the chart block reads, and reads it back the same", () => {
    const table: ChartTable = { ...STARTER, title: "This week", yLabel: "Hours" };
    const read = readChart(written(table));

    expect(read.ok).toBe(true);
    expect(read.ok ? tableOf(read.spec) : null).toEqual(table);
  });

  it("says which value is not a number, rather than writing a broken chart", () => {
    const table: ChartTable = { ...STARTER, series: [{ name: "Hours", values: ["2", "lots", "1"] }] };

    expect(sourceOf(table)).toEqual({ ok: false, problem: "“Hours” at “Tue” needs a number." });
  });

  it("leaves axis names off a pie, which has no axes", () => {
    expect(written({ ...STARTER, kind: "pie", xLabel: "Day", yLabel: "Hours" })).not.toContain("Label");
  });

  it("does not open a scatter chart, whose points have no place in the table", () => {
    const read = readChart('{"type":"scatter","data":{"datasets":[{"data":[{"x":1,"y":2}]}]}}');

    expect(read.ok ? tableOf(read.spec) : "unread").toBeNull();
  });

  it("opens a hand-written chart with fewer labels than values", () => {
    const read = readChart('{"type":"line","data":{"datasets":[{"label":"A","data":[1,2,3]}]}}');
    const table = read.ok ? tableOf(read.spec) : null;

    expect(table?.labels).toEqual(["1", "2", "3"]);
    expect(table?.series[0]?.values).toEqual(["1", "2", "3"]);
  });

  it("takes a grid pasted from a spreadsheet, tabs or commas", () => {
    expect(pastedGrid("\tMon\tTue\nHours\t2\t3\nBreaks\t1\t0")).toEqual({
      labels: ["Mon", "Tue"],
      series: [
        { name: "Hours", values: ["2", "3"] },
        { name: "Breaks", values: ["1", "0"] },
      ],
    });
    expect(pastedGrid(",A,B\nX,1,2")?.labels).toEqual(["A", "B"]);
    expect(pastedGrid("just words")).toBeNull();
  });

  it("adds and removes columns and series across every row", () => {
    const wider = withSeries(withColumn(STARTER));

    expect(wider.labels).toHaveLength(4);
    expect(wider.series.map((series) => series.values.length)).toEqual([4, 4]);
    expect(withoutColumn(wider, 0).labels).toEqual(["Tue", "Wed", "Column 4"]);
  });
});
