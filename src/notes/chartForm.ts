/**
 * The chart form's model (2026-11-08): a chart as a small table — labels across, one row
 * per series — and its translation to and from the ```chart block's JSON (`chartSpec.ts`).
 *
 * The user did not know how to use the chart block at all, since it took hand-written JSON.
 * The form edits this table instead and writes the same JSON, so the notes stay plain text
 * and a block written by hand still opens in the form. Values are kept as typed, as text,
 * until the chart is written, so a half-typed number is not lost or turned into zero.
 */
import { readChart, type ChartSpec } from "./preview/chartSpec";

/** The kinds the form makes. A scatter chart's points have no place in a labelled table. */
export type FormKind = "bar" | "line" | "pie";

export interface Series {
  readonly name: string;
  readonly values: readonly string[];
}

export interface ChartTable {
  readonly kind: FormKind;
  readonly title: string;
  readonly xLabel: string;
  readonly yLabel: string;
  readonly labels: readonly string[];
  readonly series: readonly Series[];
}

/** What a new chart starts as: something to overwrite, not a blank to puzzle over. */
export const STARTER: ChartTable = {
  kind: "bar",
  title: "",
  xLabel: "",
  yLabel: "",
  labels: ["Mon", "Tue", "Wed"],
  series: [{ name: "Series 1", values: ["2", "3.5", "1"] }],
};

/** The table a chart block describes, or `null` for one the form cannot show (scatter). */
export function tableOf(spec: ChartSpec): ChartTable | null {
  if (spec.type === "scatter") {
    return null;
  }

  const width = Math.max(spec.data.labels?.length ?? 0, ...spec.data.datasets.map((set) => set.data.length));
  const labels = Array.from({ length: width }, (_, at) => String(spec.data.labels?.[at] ?? at + 1));

  return {
    kind: spec.type,
    title: spec.options?.title ?? "",
    xLabel: spec.options?.xLabel ?? "",
    yLabel: spec.options?.yLabel ?? "",
    labels,
    series: spec.data.datasets.map((set, at) => ({
      name: set.label ?? `Series ${String(at + 1)}`,
      values: labels.map((_, column) => (set.data[column] === undefined ? "" : String(set.data[column]))),
    })),
  };
}

/** The ```chart block's JSON for `table`, or what is wrong with it, in a sentence. */
export function sourceOf(table: ChartTable): { readonly ok: true; readonly source: string } | { readonly ok: false; readonly problem: string } {
  if (table.labels.length === 0 || table.series.length === 0) {
    return { ok: false, problem: "A chart needs at least one column and one row of values." };
  }

  const datasets: { label: string; data: number[] }[] = [];

  for (const series of table.series) {
    const data: number[] = [];

    for (const [column, typed] of series.values.entries()) {
      const value = Number(typed.trim());

      if (typed.trim() === "" || !Number.isFinite(value)) {
        const where = table.labels[column] ?? String(column + 1);

        return { ok: false, problem: `“${series.name}” at “${where}” needs a number.` };
      }

      data.push(value);
    }

    datasets.push({ label: series.name.trim(), data });
  }

  const options = {
    ...(table.title.trim() === "" ? {} : { title: table.title.trim() }),
    ...(table.kind === "pie" || table.xLabel.trim() === "" ? {} : { xLabel: table.xLabel.trim() }),
    ...(table.kind === "pie" || table.yLabel.trim() === "" ? {} : { yLabel: table.yLabel.trim() }),
  };
  const source = JSON.stringify(
    {
      type: table.kind,
      data: { labels: table.labels.map((label) => label.trim()), datasets },
      ...(Object.keys(options).length === 0 ? {} : { options }),
    },
    null,
    2,
  );
  // The same check the chart block makes, so the form never writes one it cannot draw.
  const read = readChart(source);

  return read.ok ? { ok: true, source } : { ok: false, problem: read.problem };
}

/**
 * Labels and series from cells pasted out of a spreadsheet: tab-separated, or commas for a
 * CSV, the first row the labels after an empty corner, then a name and values per row.
 * `null` when the text is not a grid of at least two rows and two columns.
 */
export function pastedGrid(text: string): Pick<ChartTable, "labels" | "series"> | null {
  const rows = text
    .split(/\r?\n/u)
    .filter((row) => row.trim() !== "")
    .map((row) => row.split(row.includes("\t") ? "\t" : ",").map((cell) => cell.trim()));
  const [header, ...body] = rows;

  if (header === undefined || header.length < 2 || body.length === 0) {
    return null;
  }

  const labels = header.slice(1);

  return {
    labels,
    series: body.map((row) => ({ name: row[0] ?? "", values: labels.map((_, at) => row[at + 1] ?? "") })),
  };
}

/** `table` with a new column at the end, empty in every series. */
export function withColumn(table: ChartTable): ChartTable {
  return {
    ...table,
    labels: [...table.labels, `Column ${String(table.labels.length + 1)}`],
    series: table.series.map((series) => ({ ...series, values: [...series.values, ""] })),
  };
}

/** `table` with a new series at the end, its values empty. */
export function withSeries(table: ChartTable): ChartTable {
  return {
    ...table,
    series: [...table.series, { name: `Series ${String(table.series.length + 1)}`, values: table.labels.map(() => "") }],
  };
}

/** `table` without column `at`. */
export function withoutColumn(table: ChartTable, at: number): ChartTable {
  return {
    ...table,
    labels: table.labels.filter((_, column) => column !== at),
    series: table.series.map((series) => ({ ...series, values: series.values.filter((_, column) => column !== at) })),
  };
}

/** `table` without series `at`. */
export function withoutSeries(table: ChartTable, at: number): ChartTable {
  return { ...table, series: table.series.filter((_, row) => row !== at) };
}
