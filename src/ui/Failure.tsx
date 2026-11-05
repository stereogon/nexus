/**
 * A `CoreError` as the person reads it: the code, then the sentence saying what to do.
 *
 * Its own component because the shell, the sidebar's pane and the viewer all show one, and
 * §1.4 means the remediation sentence is never dropped in favour of the code alone. Every
 * one drawn is also noted for the error panel (⌘0), which is how an error stays findable
 * after its card has gone.
 */
import { useEffect } from "react";

import type { CommandError } from "../ipc/vault";
import { noteError } from "./errorLog";

export function Failure({ error }: { readonly error: CommandError }) {
  useEffect(() => {
    noteError(error);
  }, [error]);

  return (
    <div className="card error">
      <div className="code">{error.code}</div>
      <div>{error.remediation}</div>
    </div>
  );
}
