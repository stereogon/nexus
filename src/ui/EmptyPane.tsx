/**
 * The document pane with no document in it.
 *
 * Its own component for the same reason `Welcome` is: it is a state of the window with
 * nothing in common with the viewer that replaces it. The canvas has no artboard for it —
 * every Workspace artboard shows a lecture open — so it is deliberately plain, and the
 * two controls on it are the ones that have nowhere else to live.
 */
export function EmptyPane({
  busy,
  onAdd,
  onChooseVault,
}: {
  readonly busy: boolean;
  readonly onAdd: () => void;
  readonly onChooseVault: () => void;
}) {
  return (
    <div className="pane-empty">
      <p>Choose a lecture to read it.</p>

      {/* The canvas shows no import control: dropping a file on the window and ⌘O are
          what it offers. This keeps the action reachable with a mouse too. */}
      <button className="secondary" disabled={busy} onClick={onAdd} type="button">
        Add a lecture
      </button>
      <button className="quiet" disabled={busy} onClick={onChooseVault} type="button">
        Open another vault
      </button>
    </div>
  );
}
