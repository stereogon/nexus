/**
 * What the window shows before a vault is open.
 *
 * Kept apart from the workspace shell because it is a different screen, not a state of the
 * same one: there is no sidebar to draw, nothing to group, and the only thing to do is
 * choose a folder. Redrawn on 2026-11-09 in the redesign's type and colours, with the app's
 * own icon: it had been an unstyled heading and button from before the redesign.
 */
import icon from "../../crates/src-tauri/icons/128x128@2x.png";
import type { CommandError } from "../ipc/vault";
import { Failure } from "./Failure";

export function Welcome({
  busy,
  failures,
  onChoose,
}: {
  readonly busy: boolean;
  readonly failures: readonly CommandError[];
  readonly onChoose: () => void;
}) {
  return (
    <main className="welcome">
      <div className="welcome-card">
        <img alt="" className="welcome-icon" height="96" src={icon} width="96" />
        <h1 className="welcome-title">Nexus</h1>
        <p className="welcome-lead">Your documents and notes, side by side, entirely offline.</p>
        <button className="welcome-open" disabled={busy} onClick={onChoose} type="button">
          Open a vault
        </button>
        <p className="welcome-hint">A vault is any folder. Your notes stay in it as plain Markdown files.</p>

        {failures.map((error) => (
          <Failure error={error} key={error.code} />
        ))}
      </div>
    </main>
  );
}
