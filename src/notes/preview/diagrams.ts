/**
 * Mermaid diagrams and Chart.js charts, drawn from fenced blocks.
 *
 * Both libraries are large — Mermaid especially, a couple of megabytes — so each is loaded
 * the first time a note actually contains one, never when a lecture opens. Both render
 * asynchronously: the widget shows a quiet placeholder, fills in when ready, and asks the
 * editor to re-measure so the lines below move down rather than being drawn over.
 *
 * Mermaid runs with `securityLevel: "strict"`, which sanitises its SVG output; the source
 * is the person's own notes, but a pasted diagram from elsewhere should not be able to
 * script the window.
 */
import { WidgetType, type EditorView } from "@codemirror/view";

import { chartBlockAt, chartOpener } from "../chartEditing";
import { readChart, type ChartSpec } from "./chartSpec";
import { problem } from "./widgets";

/** Rendered diagrams by source, so moving the cursor past one does not re-render it. */
const drawn = new Map<string, string>();
let diagramCount = 0;

/** The design tokens, read at draw time so a theme change is picked up on the next draw. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export class MermaidWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  override eq(other: MermaidWidget): boolean {
    return other.source === this.source;
  }

  override toDOM(view: EditorView): HTMLElement {
    const host = document.createElement("div");
    const ready = drawn.get(this.source);

    host.className = "md-diagram";

    // A new Diagram block, before anything is pasted into it.
    if (this.source.trim() === "") {
      host.classList.add("md-diagram-empty");
      host.textContent = "Paste Mermaid code into this block, for example: graph TD; Idea --> Notes";
      return host;
    }

    if (ready !== undefined) {
      host.innerHTML = ready;
      return host;
    }

    host.textContent = "Drawing the diagram…";

    void (async () => {
      diagramCount += 1;
      const id = `nexus-diagram-${String(diagramCount)}`;

      try {
        const { default: mermaid } = await import("mermaid");

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: token("--font-ui"),
          // Mermaid's own failure picture is drawn onto the page, outside the notes; with a
          // diagram drawn as it is typed, every keystroke left another (reported 2026-11-09).
          suppressErrorRendering: true,
        });

        // Checked before drawing, so code still being typed never reaches the renderer.
        await mermaid.parse(this.source);

        const { svg } = await mermaid.render(id, this.source);

        drawn.set(this.source, svg);
        host.innerHTML = svg;
      } catch (thrown: unknown) {
        const reason = thrown instanceof Error ? thrown.message.split("\n")[0] : "it could not be read";

        host.replaceChildren(problem(`This diagram could not be drawn yet: ${reason ?? "it could not be read"}.`));
      } finally {
        // Whatever a failed draw left behind on the page, by the ids Mermaid gives it.
        for (const left of document.querySelectorAll(`#${id}, #d${id}, #i${id}`)) {
          if (!host.contains(left)) {
            left.remove();
          }
        }
      }

      view.requestMeasure();
    })();

    return host;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** The four semantic colours, then the accent, for series without colours of their own. */
function palette(): string[] {
  return ["--semantic-question", "--semantic-definition", "--semantic-key", "--semantic-exam", "--accent"].map(token);
}

/** Draws `spec` on `canvas`; the returned function tears the chart down. */
async function draw(canvas: HTMLCanvasElement, spec: ChartSpec): Promise<() => void> {
  const { Chart } = await import("chart.js/auto");
  const colours = palette();
  const colour = (index: number) => colours[index % colours.length] ?? "#888888";
  const text = token("--text-secondary");
  const grid = token("--border");
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    color: text,
    plugins: {
      title: { display: spec.options?.title !== undefined, text: spec.options?.title ?? "", color: token("--text") },
      legend: { labels: { color: text } },
    },
    scales:
      spec.type === "pie"
        ? {}
        : {
            x: {
              stacked: spec.options?.stacked ?? false,
              title: { display: spec.options?.xLabel !== undefined, text: spec.options?.xLabel ?? "", color: text },
              ticks: { color: text },
              grid: { color: grid },
            },
            y: {
              stacked: spec.options?.stacked ?? false,
              title: { display: spec.options?.yLabel !== undefined, text: spec.options?.yLabel ?? "", color: text },
              ticks: { color: text },
              grid: { color: grid },
            },
          },
  };

  // One case per type, so each dataset is built in the shape Chart.js types for that
  // type rather than cast into it.
  const chart =
    spec.type === "scatter"
      ? new Chart(canvas, {
          type: "scatter",
          data: { datasets: spec.data.datasets.map((set, at) => ({ label: set.label ?? "", data: set.data, backgroundColor: colour(at) })) },
          options,
        })
      : spec.type === "pie"
        ? new Chart(canvas, {
            type: "pie",
            data: {
              labels: spec.data.labels ?? [],
              datasets: spec.data.datasets.map((set) => ({ label: set.label ?? "", data: set.data, backgroundColor: set.data.map((_, at) => colour(at)) })),
            },
            options,
          })
        : new Chart(canvas, {
            type: spec.type,
            data: {
              labels: spec.data.labels ?? spec.data.datasets[0]?.data.map((_, at) => String(at + 1)) ?? [],
              datasets: spec.data.datasets.map((set, at) => ({
                label: set.label ?? "",
                data: set.data,
                backgroundColor: colour(at),
                borderColor: colour(at),
              })),
            },
            options,
          });

  return () => {
    chart.destroy();
  };
}

/** Teardowns for charts still on screen, keyed by their element. */
const charts = new WeakMap<HTMLElement, () => void>();

export class ChartWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  override eq(other: ChartWidget): boolean {
    return other.source === this.source;
  }

  override toDOM(view: EditorView): HTMLElement {
    const read = readChart(this.source);

    if (!read.ok) {
      return problem(`${read.problem} Click it to edit.`);
    }

    const host = document.createElement("div");
    const canvas = document.createElement("canvas");

    host.className = "md-chart";
    host.append(canvas);

    // Reopens the chart form on this block, in an editor that has one (2026-11-08).
    const open = view.state.facet(chartOpener);

    if (open !== null && read.spec.type !== "scatter") {
      const edit = document.createElement("button");

      edit.type = "button";
      edit.className = "secondary md-chart-edit";
      edit.textContent = "Edit chart";
      edit.addEventListener("click", () => {
        const at = chartBlockAt(view.state, view.posAtDOM(host));

        if (at !== null) {
          open(at);
        }
      });
      host.append(edit);
    }

    void draw(canvas, read.spec)
      .then((teardown) => {
        charts.set(host, teardown);
        view.requestMeasure();
      })
      .catch((thrown: unknown) => {
        host.replaceChildren(problem(`This chart could not be drawn: ${thrown instanceof Error ? thrown.message : String(thrown)}.`));
      });

    return host;
  }

  override destroy(dom: HTMLElement): void {
    charts.get(dom)?.();
    charts.delete(dom);
  }

  /** The Edit button is the chart's own; a click anywhere else opens the block's source. */
  override ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest(".md-chart-edit") !== null;
  }
}
