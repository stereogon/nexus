/**
 * What a ```chart block may say.
 *
 * `claude-spec.md` §2.3 asks for JSON with `type`, `data` and `options`. The shape here is
 * that, with `options` narrowed to a declarative handful — a title, axis labels, stacking —
 * mapped onto Chart.js by `charts.ts`. Not Chart.js's whole option tree: passing arbitrary
 * JSON into its typed configuration would need a cast (§4), and a note that depends on a
 * library's internals is a note that breaks on the library's next major version.
 *
 * Every chart block is validated before anything is drawn, so a typo shows a sentence
 * under the block instead of an empty canvas or a thrown error (§1.4).
 */
import { z } from "zod";

const Options = z
  .object({
    title: z.string().optional(),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    stacked: z.boolean().optional(),
  })
  .optional();

const Series = z.object({ label: z.string().optional(), data: z.array(z.number()).min(1) });
const Points = z.object({
  label: z.string().optional(),
  data: z.array(z.object({ x: z.number(), y: z.number() })).min(1),
});
const Labels = z.array(z.union([z.string(), z.number()])).optional();

export const ChartSpecSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("line"), data: z.object({ labels: Labels, datasets: z.array(Series).min(1) }), options: Options }),
  z.object({ type: z.literal("bar"), data: z.object({ labels: Labels, datasets: z.array(Series).min(1) }), options: Options }),
  z.object({ type: z.literal("pie"), data: z.object({ labels: Labels, datasets: z.array(Series).min(1) }), options: Options }),
  z.object({ type: z.literal("scatter"), data: z.object({ datasets: z.array(Points).min(1) }), options: Options }),
]);

export type ChartSpec = z.infer<typeof ChartSpecSchema>;

/** A chart, or a sentence saying what is wrong with the block. */
export function readChart(source: string): { ok: true; spec: ChartSpec } | { ok: false; problem: string } {
  let json: unknown;

  try {
    json = JSON.parse(source);
  } catch (thrown: unknown) {
    return {
      ok: false,
      problem: `This chart is not valid JSON: ${thrown instanceof Error ? thrown.message : String(thrown)}.`,
    };
  }

  const parsed = ChartSpecSchema.safeParse(json);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue === undefined || issue.path.length === 0 ? "" : ` at "${issue.path.join(".")}"`;

    return {
      ok: false,
      problem:
        `This chart could not be drawn${where}: ${issue?.message ?? "the block does not match the chart format"}. ` +
        'It needs a "type" (line, bar, pie or scatter) and "data" with at least one dataset.',
    };
  }

  return { ok: true, spec: parsed.data };
}
