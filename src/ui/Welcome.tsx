/**
 * What the window shows before a vault is open.
 *
 * Kept apart from the workspace shell because it is a different screen, not a state of the
 * same one: there is no sidebar to draw, nothing to group, and the only thing to do is
 * choose a folder.
 */
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
    <main className="content">
      <h1>Nexus</h1>
      <p className="subtitle">
        Study your lectures beside your notes, entirely offline.
      </p>

      <div className="actions">
        <button disabled={busy} onClick={onChoose} type="button">
          Open a vault
        </button>
      </div>

      {failures.map((error) => (
        <Failure error={error} key={error.code} />
      ))}
    </main>
  );
}
