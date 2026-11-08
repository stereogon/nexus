/**
 * Choosing a new table's size (2026-11-08): a grid to point at, as Notion and Google Docs
 * offer, rows counting the header. The arrow keys move the choice and Enter takes it, so
 * the keyboard is not left out.
 */
import { useEffect, useRef, useState } from "react";

/** The largest table the grid offers; a bigger one is a few clicks of + Row away. */
const MAX = 8;

export function TablePicker({ onPick, onClose }: { readonly onPick: (rows: number, columns: number) => void; readonly onClose: () => void }) {
  const [size, setSize] = useState({ rows: 3, columns: 3 });
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    box.current?.focus();
  }, []);

  const clamp = (value: number) => Math.min(MAX, Math.max(1, value));

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
        aria-label="New table"
        aria-modal="true"
        className="table-picker"
        onKeyDown={(event) => {
          const step: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
          const move = step[event.key];

          if (move !== undefined) {
            event.preventDefault();
            setSize((current) => ({ rows: clamp(current.rows + move[0]), columns: clamp(current.columns + move[1]) }));
          } else if (event.key === "Enter") {
            event.preventDefault();
            onPick(size.rows, size.columns);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        ref={box}
        role="dialog"
        tabIndex={-1}
      >
        <h2 className="chart-form-title">New table</h2>
        <div aria-hidden="true" className="table-picker-grid">
          {Array.from({ length: MAX * MAX }, (_, at) => {
            const row = Math.floor(at / MAX) + 1;
            const column = (at % MAX) + 1;

            return (
              <button
                className={row <= size.rows && column <= size.columns ? "on" : ""}
                key={at}
                onClick={() => {
                  onPick(row, column);
                }}
                onMouseEnter={() => {
                  setSize({ rows: row, columns: column });
                }}
                tabIndex={-1}
                type="button"
              />
            );
          })}
        </div>
        <p aria-live="polite" className="table-picker-size">
          {`${String(size.rows)} rows × ${String(size.columns)} columns, the first row the header`}
        </p>
        <div className="chart-form-actions">
          <button className="secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            onClick={() => {
              onPick(size.rows, size.columns);
            }}
            type="button"
          >
            Insert table
          </button>
        </div>
      </div>
    </div>
  );
}
