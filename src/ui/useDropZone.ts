/**
 * Everything the drop zone needs: whether a drag is over the window, which formats to show
 * in it, and what went wrong if it could not be set up at all.
 *
 * One hook rather than three, because these fail as one thing. A window that cannot
 * subscribe to drags and a window that cannot say which formats it takes are both windows
 * whose drop zone is not what the canvas specifies, and the person needs telling once.
 */
import { useEffect, useRef, useState } from "react";

import { onFilesDragged } from "../ipc/dragdrop";
import { importableFormats } from "../ipc/formats";
import { asCommandError, type CommandError } from "../ipc/vault";

export interface DropZone {
  /** Whether a drag is currently over the window. */
  readonly dragging: boolean;
  /** The extensions to show as chips. Empty until they have been read. */
  readonly formats: readonly string[];
  /** Why the drop zone could not be set up, if it could not. */
  readonly failure: CommandError | null;
}

/**
 * Subscribes to drags over the window and reads the importable formats.
 *
 * `onDrop` is held in a ref and the subscription is made once. Re-subscribing whenever the
 * callback changes identity would mean tearing down and rebuilding the listener on every
 * render that touches vault state — and a drag landing in that window would be dropped on
 * the floor.
 */
export function useDropZone(
  onDrop: (paths: readonly string[]) => void,
): DropZone {
  const [dragging, setDragging] = useState(false);
  const [formats, setFormats] = useState<readonly string[]>([]);
  const [failure, setFailure] = useState<CommandError | null>(null);
  const latest = useRef(onDrop);

  // In an effect rather than during render: mutating a ref while rendering is the bug React
  // 19's strict mode exists to surface.
  useEffect(() => {
    latest.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    // One mutable object rather than two local `let`s. The cleanup below assigns to them
    // from a closure the type checker cannot follow, so it concludes the cancelled flag is
    // always false and flags the check that is the entire point of it. A field is honest
    // about being written from somewhere else.
    const session: { cancelled: boolean; stop: (() => void) | null } = {
      cancelled: false,
      stop: null,
    };

    void (async () => {
      try {
        setFormats(await importableFormats());

        const unlisten = await onFilesDragged({
          onEnter: () => {
            setDragging(true);
          },
          onLeave: () => {
            setDragging(false);
          },
          onDrop: (paths) => {
            // Cleared here as well as on `leave`, because a drop does not always produce
            // one — and an overlay left over the window would hide the vault it just
            // imported into.
            setDragging(false);
            latest.current(paths);
          },
        });

        // Unmounted while that was in flight. Dropping the handle without calling it would
        // leak a listener holding a setState on a component that is gone.
        if (session.cancelled) {
          unlisten();

          return;
        }

        session.stop = unlisten;
      } catch (thrown: unknown) {
        setFailure(asCommandError(thrown));
      }
    })();

    return () => {
      session.cancelled = true;
      session.stop?.();
    };
  }, []);

  return { dragging, formats, failure };
}
