/**
 * The dialogs the notes editor opens over itself: the chart form, the table picker, and
 * naming a new page (2026-11-14). Moved out of `NotesEditor` when the third arrived, so that
 * file keeps to building and hosting the view; what each writes is unchanged.
 */
import type { EditorView } from "@codemirror/view";
import type { RefObject } from "react";

import { writeChart, type ChartAt } from "../notes/chartEditing";
import { writePageLink, type PageLine } from "../notes/pageLinks";
import { insertTable, type TableLine } from "../notes/tableInsert";
import { ChartForm } from "./ChartForm";
import { PageNameForm } from "./PageNameForm";
import { TablePicker } from "./TablePicker";

/** The chart form, open on a block or a new chart's line, and why its last save failed. */
export type ChartOpen = { readonly at: ChartAt; readonly failure: string | null } | null;

export function EditorDialogs({
  view,
  chart,
  onChart,
  tableLine,
  onTableLine,
  pageLine,
  onPageLine,
  onNewPage,
}: {
  readonly view: RefObject<EditorView | null>;
  readonly chart: ChartOpen;
  readonly onChart: (chart: ChartOpen) => void;
  readonly tableLine: TableLine | null;
  readonly onTableLine: (line: TableLine | null) => void;
  readonly pageLine: PageLine | null;
  readonly onPageLine: (line: PageLine | null) => void;
  /** Makes a page named `title` inside these notes, resolving to the line that links it. */
  readonly onNewPage: (title: string) => Promise<string>;
}) {
  const closed = () => {
    view.current?.focus();
  };

  return (
    <>
      {chart !== null && (
        <ChartForm
          failure={chart.failure}
          onClose={() => {
            onChart(null);
            closed();
          }}
          onSave={(source) => {
            const failure = view.current === null ? "The notes are not open." : writeChart(view.current, chart.at, source);

            onChart(failure === null ? null : { ...chart, failure });
          }}
          source={chart.at.source}
        />
      )}
      {tableLine !== null && (
        <TablePicker
          onClose={() => {
            onTableLine(null);
            closed();
          }}
          onPick={(rows, columns) => {
            onTableLine(null);

            if (view.current !== null) {
              insertTable(view.current, tableLine, rows, columns);
            }
          }}
        />
      )}
      {pageLine !== null && (
        <PageNameForm
          onClose={() => {
            onPageLine(null);
            closed();
          }}
          onCreate={async (title) => {
            const link = await onNewPage(title);

            onPageLine(null);

            if (view.current !== null) {
              writePageLink(view.current, pageLine, link);
            }
          }}
        />
      )}
    </>
  );
}
