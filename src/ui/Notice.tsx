/**
 * The confirmation: what just happened, and a way to stop reading it. A message floating at
 * the foot of the window (redesign, 2026-11-07), shown whatever is open — until then it sat
 * in the empty pane, so a move or a rename made with a document open was never confirmed.
 *
 * `role="status"` rather than `alert`: this reports something that succeeded, so it should
 * be announced when there is a pause rather than interrupting whatever is being read.
 * Failures use `Failure`, which is a different thing and does not time out.
 */
export function Notice({
  text,
  onDismiss,
}: {
  readonly text: string;
  readonly onDismiss: () => void;
}) {
  return (
    <div className="toast" role="status">
      <span>{text}</span>
      <button
        aria-label="Dismiss"
        className="toast-dismiss"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
