/**
 * A `CoreError` as the person reads it: what to do first, then the code, quieter, for
 * reporting it.
 *
 * Its own component because the shell, the sidebar's pane and the viewer all show one, and
 * §1.4 means the remediation sentence is never dropped in favour of the code alone. Every
 * one drawn is also noted for the error panel (⌘0), which is how an error stays findable
 * after its card has gone. Redrawn on 2026-11-09 in the redesign's soft card, the sentence
 * first: it had been a bordered box led by the code in capitals.
 */
import { useEffect } from "react";

import type { CommandError } from "../ipc/vault";
import { noteError } from "./errorLog";

export function Failure({ error, onDismiss }: { readonly error: CommandError; readonly onDismiss?: () => void }) {
  useEffect(() => {
    noteError(error);
  }, [error]);

  return (
    <div className="failure" role="alert">
      <span aria-hidden="true" className="failure-mark">
        !
      </span>
      <div className="failure-body">
        <p className="failure-text">{error.remediation}</p>
        <p className="failure-code">{error.code}</p>
      </div>
      {onDismiss !== undefined && (
        <button aria-label="Dismiss" className="failure-dismiss" onClick={onDismiss} type="button">
          ×
        </button>
      )}
    </div>
  );
}
