/**
 * The confirmation strip: what just happened, and a way to stop reading it.
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
    <div className="note" role="status">
      <span>{text}</span>
      <button
        aria-label="Dismiss"
        className="note-dismiss"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
