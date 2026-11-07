/**
 * Ordinary Markdown, rendered in place: the markup hidden, what it means drawn.
 *
 * The established CodeMirror technique for a live preview (the approach Obsidian calls
 * "Live Preview"): walk the syntax tree, and on every line the cursor is *not* on, hide
 * the markup characters and draw their meaning — `#` gone and the heading large, `**` gone
 * and the words bold, `>` gone and a bar beside the quote, `-` drawn as a bullet, `[ ]` as
 * a checkbox, `---` as a rule, a table as a table. The line the cursor is on shows its
 * Markdown, so everything stays editable as text.
 *
 * Line-level reveal, not character-level: entering a line shows all of its markup. That is
 * the predictable rule — the line jumps once, when the cursor arrives, and not again as it
 * moves across each bold word.
 *
 * Reported 2026-11-05: quotes only dimmed, tables were not recognised at all, and the
 * notes showed their Markdown and its preview at once.
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";

import { BulletWidget, CheckboxWidget, LanguageWidget, RuleWidget } from "./markupWidgets";
import { parseTable, TableWidget } from "./table";

const hidden = Decoration.replace({});

/** The lines any cursor or selection touches. */
export function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;

    for (let line = first; line <= last; line += 1) {
      lines.add(line);
    }
  }

  return lines;
}

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
  const active = activeLines(state);
  const doc = state.doc;
  const lineOf = (at: number) => doc.lineAt(at).number;
  const offLine = (at: number) => !active.has(lineOf(at));
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

  /**
   * A fenced code block: one panel, its fences hidden and its language shown as a label
   * while the cursor is elsewhere. Reported 2026-11-05 — the ``` lines showed as text in
   * a flat grey box, and nothing was coloured.
   */
  const codeBlock = (from: number, to: number) => {
    const first = doc.lineAt(from);
    const last = doc.lineAt(to);
    const closed = last.number > first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text);
    const touched = [...active].some((line) => line >= first.number && line <= last.number);

    for (let number = first.number; number <= last.number; number += 1) {
      const edges = [number === first.number ? "md-code-first" : "", number === last.number ? "md-code-last" : ""];

      out.push(Decoration.line({ class: ["md-code-line", ...edges].join(" ").trim() }).range(doc.line(number).from));
    }

    if (touched) {
      return;
    }

    const language = /^\s*(?:`{3,}|~{3,})\s*([\w+#.-]*)/.exec(first.text)?.[1] ?? "";

    out.push(
      (language === "" ? hidden : Decoration.replace({ widget: new LanguageWidget(language) })).range(first.from, first.to),
    );

    if (closed) {
      out.push(hidden.range(last.from, last.to));
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
          const source = doc.sliceString(node.from, node.to);
          const table = parseTable(source);
          const touched = [...active].some((line) => line >= lineOf(node.from) && line <= lineOf(node.to));

          if (table === null || touched) {
            lineClass(node.from, node.to, "md-table-source");
          } else {
            out.push(Decoration.replace({ widget: new TableWidget(source, table), block: true }).range(node.from, node.to));
            tables.push({ from: node.from, to: node.to });
          }

          return false;
        }

        case "InlineCode":
          out.push(Decoration.mark({ class: "md-inline-code" }).range(node.from, node.to));
          return true;

        case "Blockquote":
          lineClass(node.from, node.to, "md-quote");
          return true;

        case "BulletList":
        case "OrderedList":
          lists += 1;
          return true;

        case "QuoteMark":
        case "HeaderMark":
          if (offLine(node.from)) {
            hideWithSpace(node.from, node.to);
          }
          return true;

        case "EmphasisMark":
        case "StrikethroughMark":
        case "CodeMark":
        case "LinkMark":
        case "URL":
        case "LinkTitle":
          if (offLine(node.from)) {
            out.push(hidden.range(node.from, node.to));
          }
          return true;

        case "ListMark": {
          // A to-do is drawn as its box alone, as the canvas draws it: the list's own `-`
          // before it would put a bullet beside the box.
          const isTask = (node.node.parent?.getChild("Task") ?? null) !== null;

          if (offLine(node.from) && isTask) {
            hideWithSpace(node.from, node.to);
          } else if (offLine(node.from) && node.node.parent?.parent?.name === "BulletList") {
            out.push(Decoration.replace({ widget: new BulletWidget(lists - 1) }).range(node.from, node.to));
          }
          return true;
        }

        case "TaskMarker": {
          const checked = /x/i.test(doc.sliceString(node.from, node.to));
          const task = node.node.parent;

          if (offLine(node.from)) {
            out.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to));
          }

          // Done is struck through and quieter, whether or not the cursor is on the line.
          if (checked && task !== null && task.to > node.to) {
            out.push(Decoration.mark({ class: "md-done" }).range(node.to, task.to));
          }
          return true;
        }

        case "HorizontalRule":
          if (offLine(node.from)) {
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
