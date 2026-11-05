/**
 * Reading a ```chart block, and the sentences a broken one gets.
 */
import { describe, expect, it } from "vitest";

import { readChart } from "./chartSpec";

describe("a chart block", () => {
  it("reads a bar chart", () => {
    const read = readChart('{"type":"bar","data":{"labels":["Raft","Paxos"],"datasets":[{"label":"Papers","data":[3,5]}]}}');

    expect(read.ok && read.spec.type).toBe("bar");
  });

  it("reads a scatter chart of points", () => {
    const read = readChart('{"type":"scatter","data":{"datasets":[{"data":[{"x":1,"y":2},{"x":3,"y":4}]}]}}');

    expect(read.ok && read.spec.type).toBe("scatter");
  });

  it("keeps the declarative options", () => {
    const read = readChart('{"type":"line","data":{"datasets":[{"data":[1,2]}]},"options":{"title":"Latency","stacked":true}}');

    expect(read.ok && read.spec.options).toEqual({ title: "Latency", stacked: true });
  });

  it("says plainly when the JSON is broken, rather than throwing", () => {
    const read = readChart('{"type":"bar",');

    expect(read.ok).toBe(false);
    expect(!read.ok && read.problem).toMatch(/^This chart is not valid JSON/);
  });

  it("names where a block goes wrong", () => {
    const read = readChart('{"type":"bar","data":{"datasets":[{"data":["three"]}]}}');

    expect(!read.ok && read.problem).toMatch(/at "data\.datasets\.0\.data\.0"/);
  });

  it("refuses a chart type it cannot draw, and says which it can", () => {
    const read = readChart('{"type":"radar","data":{"datasets":[{"data":[1]}]}}');

    expect(!read.ok && read.problem).toMatch(/line, bar, pie or scatter/);
  });

  it("refuses a chart with no data", () => {
    expect(readChart('{"type":"pie","data":{"datasets":[]}}').ok).toBe(false);
  });
});
