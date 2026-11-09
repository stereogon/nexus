/**
 * Ordinary Markdown, rendered in place: the markup hidden, what it means drawn.
 *
 * The established CodeMirror technique for a live preview: walk the syntax tree, hide the
 * markup characters and draw their meaning — `#` gone and the heading large, `**` gone and
 * the words bold, `>` gone and a bar beside the quote, `-` drawn as a bullet, `[ ]` as a
 * checkbox, `---` as a rule, a table as a table.
 *
 * Hidden on the cursor's line too, as Notion does (2026-11-07; until then the cursor's line
 * showed its Markdown). The text underneath is still Markdown, and copying gives it. The
 * exceptions are what cannot be edited any other way: a link's address while the cursor is
 * in the link, a table's source while the cursor is in the table, and a rule still being
 * written. `blockKeys.ts` keeps the cursor off positions only hidden text occupies.
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";

import { calloutOf } from "../callout";
import { CalloutHeadWidget } from "./calloutWidget";
import { BulletWidget, CheckboxWidget, CodeFootWidget, CodeHeaderWidget, RuleWidget } from "./markupWidgets";
import { parseTable, tableStart } from "./table";
import { TableEditorWidget } from "./tableEditor";
import { SpacedWidget } from "./widgets";

const hidden = Decoration.replace({});

/**
 * The decorations for ordinary Markdown in `state`.
 *
 * `claimed` says whether a range is already drawn by the other previews (a citation card,
 * a diagram); nothing here touches those, so two decorations never fight over one range.
 */
export function markupDecorations(
  state: EditorState,
  claimed: (from: number, to: number) => boolean,
): { readonly decorations: Range<Decoration>[]; readonly tables: { from: number; to: number }[] } {
  const out: Range<Decoration>[] = [];
  const tables: { from: number; to: number }[] = [];
  const doc = state.doc;
  const lineOf = (at: number) => doc.lineAt(at).number;
  // Whether a cursor or selection is within `from`–`to`: only a link's address is shown
  // then, since there is no other way to edit it. Every other mark stays hidden, as Notion
  // keeps them (2026-11-07): the notes are still Markdown, and copying shows it.
  const within = (from: number, to: number) =>
    state.selection.ranges.some((range) => range.from >= from && range.to <= to);
  const lineClass = (from: number, to: number, className: string) => {
    for (let line = lineOf(from); line <= lineOf(to); line += 1) {
      out.push(Decoration.line({ class: className }).range(doc.line(line).from));
    }
  };
  /** Hides a mark and the one space after it, as `# ` and `> ` are written. */
  const hideWithSpace = (from: number, to: number) => {
    out.push(hidden.range(from, doc.sliceString(to, to + 1) === " " ? to + 1 : to));
  };
  let lists = 0;
  /** Where each callout's marker line starts, which its head replaces. */
  const heads = new Set<number>();

  /**
   * A fenced code block: one panel, its fence lines drawn as blocks — the header, with the
   * language menu and Copy, above; a rounded foot below — so the cursor can never stand on
   * them. Hidden but still lines, the closing fence was where a click below the code put
   * the cursor, and typing there went after the backticks and broke the block (reported
   * 2026-11-07).
   */
  const codeBlock = (from: number, to: number) => {
    const first = doc.lineAt(from);
    const last = doc.lineAt(to);
    const closed = last.number > first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text);
    const lastBody = closed ? last.number - 1 : last.number;

    for (let number = first.number + 1; number <= lastBody; number += 1) {
      out.push(Decoration.line({ class: "md-code-line" }).range(doc.line(number).from));
    }

    const language = /^\s*(?:`{3,}|~{3,})\s*([\w+#.-]*)/.exec(first.text)?.[1] ?? "";

    out.push(
      Decoration.replace({ widget: new CodeHeaderWidget(language, first.from), block: true }).range(first.from, first.to),
    );

    if (closed) {
      out.push(Decoration.replace({ widget: new CodeFootWidget(), block: true }).range(last.from, last.to));
    }
  };

  syntaxTree(state).iterate({
    enter(node) {
      if (claimed(node.from, node.to)) {
        return false;
      }

      switch (node.name) {
        case "Image":
          return false;

        case "FencedCode": {
          codeBlock(node.from, node.to);
          return false;
        }

        case "Table": {
          // From the line recording its column widths, when it has one, which is drawn as part of it.
          const from = tableStart(doc, node.from);
          const source = doc.sliceString(from, node.to);
          const table = parseTable(source);

          // Edited where it is drawn (`tableEditor.ts`), so it stays a table with the cursor
          // in it; only a table that cannot be read shows as its text (2026-11-08).
          if (table === null) {
            lineClass(node.from, node.to, "md-table-source");
          } else {
            out.push(
              Decoration.replace({ widget: new SpacedWidget(new TableEditorWidget(source, table)), block: true }).range(from, node.to),
            );
            tables.push({ from, to: node.to });
          }

          return false;
        }

        case "ATXHeading1":
        case "ATXHeading2":
        case "ATXHeading3":
        case "ATXHeading4":
        case "ATXHeading5":
        case "ATXHeading6":
          lineClass(node.from, node.to, `md-h${node.name.slice(-1)}`);
          return true;

        case "InlineCode":
          out.push(Decoration.mark({ class: "md-inline-code" }).range(node.from, node.to));
          return true;

        case "Blockquote": {
          const first = doc.lineAt(node.from);
          const type = calloutOf(first.text);

          if (type === null) {
            lineClass(node.from, node.to, "md-quote");
            return true;
          }

          // A callout (2026-11-09): its marker line drawn as its head, its lines a tinted box.
          const last = doc.lineAt(node.to);

          out.push(
            Decoration.replace({ widget: new CalloutHeadWidget(type, first.from, last.number === first.number), block: true }).range(first.from, first.to),
          );
          heads.add(first.from);

          for (let number = first.number + 1; number <= last.number; number += 1) {
            const end = number === last.number ? " md-callout-end" : "";

            out.push(Decoration.line({ class: `md-callout-line md-callout-${type}${end}` }).range(doc.line(number).from));
          }
          return true;
        }

        case "BulletList":
        case "OrderedList":
          lists += 1;
          return true;

        case "QuoteMark":
        case "HeaderMark":
          // A callout's marker line is already drawn whole as its head.
          if (!heads.has(doc.lineAt(node.from).from)) {
            hideWithSpace(node.from, node.to);
          }
          return true;

        case "EmphasisMark":
        case "StrikethroughMark":
        case "CodeMark":
          out.push(hidden.range(node.from, node.to));
          return true;

        case "LinkMark":
        case "URL":
        case "LinkTitle": {
          const link = node.node.parent;

          if (link === null || !within(link.from, link.to)) {
            out.push(hidden.range(node.from, node.to));
          }
          return true;
        }

        case "ListMark": {
          // A to-do is drawn as its box alone, as the canvas draws it: the list's own `-`
          // before it would put a bullet beside the box.
          const isTask = (node.node.parent?.getChild("Task") ?? null) !== null;

          if (isTask) {
            hideWithSpace(node.from, node.to);
          } else if (node.node.parent?.parent?.name === "BulletList") {
            out.push(Decoration.replace({ widget: new BulletWidget(lists - 1) }).range(node.from, node.to));
          }
          return true;
        }

        case "TaskMarker": {
          const checked = /x/i.test(doc.sliceString(node.from, node.to));
          const task = node.node.parent;

          out.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to));

          // Done is struck through and quieter, whether or not the cursor is on the line.
          if (checked && task !== null && task.to > node.to) {
            out.push(Decoration.mark({ class: "md-done" }).range(node.to, task.to));
          }
          return true;
        }

        case "HorizontalRule":
          // A cursor strictly inside means it is still being written: bold chosen on an
          // empty line writes `****`, which is a rule until the words go between the marks.
          if (!state.selection.ranges.some((range) => range.from > node.from && range.to < node.to)) {
            out.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to));
          }
          return true;

        default:
          return true;
      }
    },
    leave(node) {
      if (node.name === "BulletList" || node.name === "OrderedList") {
        lists -= 1;
      }
    },
  });

  return { decorations: out, tables };
}
