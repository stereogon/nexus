/**
 * The chart form (2026-11-08): a chart made from a small table instead of hand-written
 * JSON. The kind, a title and axis names above; labels across the top of a grid, one row
 * per series; cells pasted from a spreadsheet fill the grid. Saving writes an ordinary
 * ```chart block (`chartForm.ts`), so the notes stay plain text.
 */
import { useEffect, useRef, useState, type ClipboardEvent } from "react";

import { pastedGrid, sourceOf, STARTER, tableOf, withSeries, type ChartTable, type FormKind } from "../notes/chartForm";
import { readChart } from "../notes/preview/chartSpec";
import { ChartGrid } from "./ChartGrid";

const KINDS: readonly { readonly kind: FormKind; readonly label: string }[] = [
  { kind: "bar", label: "Bar" },
  { kind: "line", label: "Line" },
  { kind: "pie", label: "Pie" },
];

/** The table a block opens as: a new chart's starter, or what the block says. */
function opening(source: string | null): ChartTable | "unsupported" {
  if (source === null) {
    return STARTER;
  }

  const read = readChart(source);

  if (!read.ok) {
    return STARTER;
  }

  return tableOf(read.spec) ?? "unsupported";
}

export function ChartForm({
  source,
  failure,
  onSave,
  onClose,
}: {
  /** The block's JSON, or `null` for a new chart. */
  readonly source: string | null;
  /** Why the last save could not be written, if it could not. */
  readonly failure: string | null;
  readonly onSave: (source: string) => void;
  readonly onClose: () => void;
}) {
  const opened = opening(source);
  const [table, setTable] = useState<ChartTable>(opened === "unsupported" ? STARTER : opened);
  const [problem, setProblem] = useState<string | null>(null);
  const first = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);

  const set = (change: Partial<ChartTable>) => {
    setTable((current) => ({ ...current, ...change }));
    setProblem(null);
  };
  // A grid pasted into any cell replaces the table's labels and values, as a spreadsheet
  // paste would; a single value pastes into its cell as usual.
  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    const grid = pastedGrid(event.clipboardData.getData("text/plain"));

    if (grid !== null) {
      event.preventDefault();
      set(grid);
    }
  };

  const save = () => {
    const result = sourceOf(table);

    if (result.ok) {
      onSave(result.source);
    } else {
      setProblem(result.problem);
    }
  };

  const shown = problem ?? failure;

  return (
    <div
      className="chart-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-label={source === null ? "New chart" : "Edit chart"}
        aria-modal="true"
        className="chart-form"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        role="dialog"
      >
        <h2 className="chart-form-title">{source === null ? "New chart" : "Edit chart"}</h2>

        {opened === "unsupported" ? (
          <>
            <p className="chart-form-note">
              This is a scatter chart, whose points have no place in this table. Edit its JSON in the notes instead: click
              the chart to show it.
            </p>
            <div className="chart-form-actions">
              <button onClick={onClose} type="button">
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div aria-label="Kind of chart" className="segmented chart-kinds" role="group">
              {KINDS.map(({ kind, label }) => (
                <button
                  aria-pressed={table.kind === kind}
                  key={kind}
                  onClick={() => {
                    set({ kind });
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="chart-form-fields">
              <label>
                Title
                <input
                  onChange={(event) => {
                    set({ title: event.target.value });
                  }}
                  placeholder="Optional"
                  ref={first}
                  value={table.title}
                />
              </label>
              {table.kind !== "pie" && (
                <>
                  <label>
                    Across the bottom
                    <input
                      onChange={(event) => {
                        set({ xLabel: event.target.value });
                      }}
                      placeholder="Optional"
                      value={table.xLabel}
                    />
                  </label>
                  <label>
                    Up the side
                    <input
                      onChange={(event) => {
                        set({ yLabel: event.target.value });
                      }}
                      placeholder="Optional"
                      value={table.yLabel}
                    />
                  </label>
                </>
              )}
            </div>

            <div className="chart-grid-wrap" onPaste={onPaste}>
              <ChartGrid onChange={set} table={table} />
            </div>
            <button
              className="quiet chart-add-series"
              onClick={() => {
                set(withSeries(table));
              }}
              type="button"
            >
              + Series
            </button>
            <p className="chart-form-note">Paste cells from a spreadsheet into any box to fill the whole table.</p>

            {shown !== null && (
              <p className="chart-form-problem" role="alert">
                {shown}
              </p>
            )}

            <div className="chart-form-actions">
              <button className="secondary" onClick={onClose} type="button">
                Cancel
              </button>
              <button onClick={save} type="button">
                {source === null ? "Insert chart" : "Save chart"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
