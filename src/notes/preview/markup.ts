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
import { Decoration, WidgetType, type EditorView } from "@codemirror/view";

import { parseTable, TableWidget } from "./table";

const hidden = Decoration.replace({});

class BulletWidget extends WidgetType {
  constructor(readonly depth: number) {
    super();
  }

  override eq(other: BulletWidget): boolean {
    return other.depth === this.depth;
  }

  override toDOM(): HTMLElement {
    const bullet = document.createElement("span");

    bullet.className = "md-bullet";
    bullet.textContent = ["•", "◦", "▪"][this.depth % 3] ?? "•";

    return bullet;
  }
}

/** A task's box. Clicking it toggles `[ ]` and `[x]` in the text itself. */
class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly at: number,
  ) {
    super();
  }

  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.at === this.at;
  }

  override toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("input");

    box.type = "checkbox";
    box.className = "md-checkbox";
    box.checked = this.checked;
    box.setAttribute("aria-label", this.checked ? "Done" : "Not done");
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ changes: { from: this.at, to: this.at + 3, insert: this.checked ? "[ ]" : "[x]" } });
    });

    return box;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

class RuleWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const rule = document.createElement("span");

    rule.className = "md-rule";

    return rule;
  }
}

/** The lines any cursor or selection touches. */
function activeLines(state: EditorState): Set<number> {
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

  syntaxTree(state).iterate({
    enter(node) {
      if (claimed(node.from, node.to)) {
        return false;
      }

      switch (node.name) {
        case "Image":
          return false;

        case "FencedCode":
          lineClass(node.from, node.to, "md-code-line");
          return false;

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

        case "ListMark":
          if (offLine(node.from) && node.node.parent?.parent?.name === "BulletList") {
            out.push(Decoration.replace({ widget: new BulletWidget(lists - 1) }).range(node.from, node.to));
          }
          return true;

        case "TaskMarker":
          if (offLine(node.from)) {
            const checked = /x/i.test(doc.sliceString(node.from, node.to));

            out.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to));
          }
          return true;

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
