/**
 * The chart form's grid (2026-11-08): labels across the top, one row per series, a value
 * in each cell. Split from `ChartForm`, which holds the rest of the form and the saving.
 */
import { withColumn, withoutColumn, withoutSeries, type ChartTable } from "../notes/chartForm";

export function ChartGrid({
  table,
  onChange,
}: {
  readonly table: ChartTable;
  readonly onChange: (change: Partial<ChartTable>) => void;
}) {
  const setLabel = (at: number, label: string) => {
    onChange({ labels: table.labels.map((old, column) => (column === at ? label : old)) });
  };
  const setName = (at: number, name: string) => {
    onChange({ series: table.series.map((old, row) => (row === at ? { ...old, name } : old)) });
  };
  const setValue = (at: number, column: number, value: string) => {
    onChange({
      series: table.series.map((old, row) =>
        row === at ? { ...old, values: old.values.map((cell, index) => (index === column ? value : cell)) } : old,
      ),
    });
  };

  return (
    <table aria-label="Values" className="chart-grid">
      <thead>
        <tr>
          <th scope="col">
            <span className="vh">Series</span>
          </th>
          {table.labels.map((label, column) => (
            <th key={column} scope="col">
              <input
                aria-label={`Label ${String(column + 1)}`}
                onChange={(event) => {
                  setLabel(column, event.target.value);
                }}
                value={label}
              />
              {table.labels.length > 1 && (
                <button
                  aria-label={`Remove column ${label === "" ? String(column + 1) : label}`}
                  className="chart-grid-remove"
                  onClick={() => {
                    onChange(withoutColumn(table, column));
                  }}
                  type="button"
                >
                  ✕
                </button>
              )}
            </th>
          ))}
          <th scope="col">
            <button
              className="quiet"
              onClick={() => {
                onChange(withColumn(table));
              }}
              type="button"
            >
              + Column
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {table.series.map((series, row) => (
          <tr key={row}>
            <th scope="row">
              <input
                aria-label={`Series ${String(row + 1)} name`}
                onChange={(event) => {
                  setName(row, event.target.value);
                }}
                value={series.name}
              />
              {table.series.length > 1 && (
                <button
                  aria-label={`Remove ${series.name === "" ? `series ${String(row + 1)}` : series.name}`}
                  className="chart-grid-remove"
                  onClick={() => {
                    onChange(withoutSeries(table, row));
                  }}
                  type="button"
                >
                  ✕
                </button>
              )}
            </th>
            {series.values.map((value, column) => (
              <td key={column}>
                <input
                  aria-label={`${series.name} at ${table.labels[column] ?? String(column + 1)}`}
                  inputMode="decimal"
                  onChange={(event) => {
                    setValue(row, column, event.target.value);
                  }}
                  value={value}
                />
              </td>
            ))}
            <td />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
