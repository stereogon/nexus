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
import { useEffect, useState } from "react";

import type { DocumentRisk } from "../ipc/document";
import { noticeQuiet, quietNotice } from "../ipc/notice";

export function DocumentNotice({
  risks,
  needsAttention,
  vault,
  directory,
}: {
  readonly risks: readonly DocumentRisk[];
  readonly needsAttention: boolean;
  readonly vault: string;
  readonly directory: string;
}) {
  const [open, setOpen] = useState(needsAttention);
  // Whether to show it at all (2026-11-09): ✕ puts it away until the document is opened
  // again, and "Don't show again" for good on this device. Unknown until asked, so a quiet
  // notice does not flash up first.
  const [shown, setShown] = useState<boolean | null>(null);

  useEffect(() => {
    const session = { live: true };

    void noticeQuiet(vault, directory).then((quiet) => {
      if (session.live) {
        setShown(!quiet);
      }
    });

    return () => {
      session.live = false;
    };
  }, [vault, directory]);

  if (risks.length === 0 || shown !== true) {
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
        <button
          aria-label="Dismiss"
          className="chrome-icon notice-dismiss"
          onClick={() => {
            setShown(false);
          }}
          title="Put this away until the document is opened again"
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" viewBox="0 0 14 14" width="12">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
          </svg>
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
          <li className="notice-quiet">
            <button
              className="quiet"
              onClick={() => {
                setShown(false);
                void quietNotice(vault, directory);
              }}
              type="button"
            >
              Don't show again for this document
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}
