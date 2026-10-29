/**
 * What the screening found, said plainly.
 *
 * # Not a gate, and not an alarm
 *
 * It does not block the document. Every indicator it can report is something the viewer is
 * already configured to refuse — no script runs, nothing launches, nothing is fetched — so
 * standing between the person and their lecture would be theatre. What it does is tell
 * them, which is the part they cannot do for themselves.
 *
 * Expanded when the domain says a finding is notable, collapsed to one line otherwise. A
 * deck with four hundred hyperlinks should not open behind a wall of text, and a deck that
 * wants to launch a program should not be one click away from being missed.
 *
 * # This state is not on the design canvas
 *
 * §3 makes the canvas authoritative and it has no artboard for this: it was asked for
 * after the canvas was drawn. The colours, type and spacing are taken from the canvas's
 * own tokens rather than invented, and it wants an artboard of its own — recorded in
 * `PROGRESS.md` rather than left as a difference someone finds later.
 */
import { useState } from "react";

import type { DocumentRisk } from "../ipc/document";

export function DocumentNotice({
  risks,
  needsAttention,
}: {
  readonly risks: readonly DocumentRisk[];
  readonly needsAttention: boolean;
}) {
  const [open, setOpen] = useState(needsAttention);

  if (risks.length === 0) {
    return null;
  }

  const summary =
    risks.length === 1
      ? "This document asks for 1 thing Nexus does not do."
      : `This document asks for ${String(risks.length)} things Nexus does not do.`;

  return (
    <section className={needsAttention ? "notice attention" : "notice"}>
      <div className="notice-head">
        <p className="notice-summary">{summary}</p>
        <button
          aria-expanded={open}
          className="quiet"
          onClick={() => {
            setOpen(!open);
          }}
          type="button"
        >
          {open ? "Hide" : "What it asks for"}
        </button>
      </div>

      {open && (
        <ul className="notice-list">
          {risks.map((risk) => (
            <li key={risk.code}>
              <span className={`dot ${risk.severity}`} />
              <span>{risk.explanation}</span>
              <code className="code">{risk.code}</code>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
