/**
 * Callouts (2026-11-09), Notion's coloured boxes, written as GitHub's alerts: a quote whose
 * first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]`. Chosen
 * over a syntax of Nexus's own so a callout reads as one on GitHub and as a plain quote in
 * any other editor; the notes stay Markdown.
 */

export type CalloutType = "note" | "tip" | "important" | "warning" | "caution";

export const CALLOUTS: readonly { readonly type: CalloutType; readonly label: string; readonly icon: string }[] = [
  { type: "note", label: "Note", icon: "ℹ" },
  { type: "tip", label: "Tip", icon: "✦" },
  { type: "important", label: "Important", icon: "❢" },
  { type: "warning", label: "Warning", icon: "⚠" },
  { type: "caution", label: "Caution", icon: "⛔" },
];

const MARKER = /^\s*>\s*\[!(note|tip|important|warning|caution)\]\s*$/iu;

/** The callout a quote line opens, if it is a callout's marker line. */
export function calloutOf(line: string): CalloutType | null {
  const found = MARKER.exec(line)?.[1]?.toLowerCase();

  return CALLOUTS.find((callout) => callout.type === found)?.type ?? null;
}

/** The marker line for `type`. */
export const calloutMarker = (type: CalloutType) => `> [!${type.toUpperCase()}]`;
