/**
 * A callout's head (2026-11-09), drawn in place of its `> [!NOTE]` line: the icon and a
 * menu of the five kinds, which rewrites the marker. A block of its own, so the cursor
 * never stands on the marker, as with a code block's fences.
 */
import { WidgetType, type EditorView } from "@codemirror/view";

import { CALLOUTS, calloutMarker, type CalloutType } from "../callout";

export class CalloutHeadWidget extends WidgetType {
  constructor(
    readonly type: CalloutType,
    /** Where the marker line starts. */
    readonly at: number,
    /** Whether lines follow it in the callout, or it is the whole of it. */
    readonly alone: boolean,
  ) {
    super();
  }

  override eq(other: CalloutHeadWidget): boolean {
    return other.type === this.type && other.at === this.at && other.alone === this.alone;
  }

  override toDOM(view: EditorView): HTMLElement {
    const outer = document.createElement("div");
    const head = document.createElement("div");
    const icon = document.createElement("span");
    const menu = document.createElement("select");
    const kind = CALLOUTS.find((callout) => callout.type === this.type);

    outer.className = this.alone ? "md-callout-top md-callout-alone" : "md-callout-top";
    head.className = `md-callout-head md-callout-${this.type}`;
    icon.className = "md-callout-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = kind?.icon ?? "";
    menu.className = "md-callout-kind";
    menu.setAttribute("aria-label", "Callout kind");

    for (const callout of CALLOUTS) {
      const option = document.createElement("option");

      option.value = callout.type;
      option.textContent = callout.label;
      option.selected = callout.type === this.type;
      menu.append(option);
    }

    menu.addEventListener("change", () => {
      const line = view.state.doc.lineAt(this.at);
      const chosen = CALLOUTS.find((callout) => callout.type === menu.value);

      if (chosen !== undefined) {
        view.dispatch({ changes: { from: line.from, to: line.to, insert: calloutMarker(chosen.type) } });
      }
      view.focus();
    });

    head.append(icon, menu);
    outer.append(head);

    return outer;
  }

  override ignoreEvent(event: Event): boolean {
    return event.target instanceof HTMLSelectElement;
  }
}
