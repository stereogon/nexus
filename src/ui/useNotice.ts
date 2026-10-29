/**
 * A confirmation that says what just happened, and then stops saying it.
 *
 * # Why this is not part of the vault's state
 *
 * It was, and that was the bug: `VaultState` carried a `note`, set after an import and
 * cleared by nothing, so "Added …" sat over the empty pane until the next action replaced
 * it. Reported on 2026-10-29 after it stayed put.
 *
 * `App` already argues that `busy`, `groupBy` and `editing` sit outside that union because
 * each is orthogonal to which vault is open. A confirmation is orthogonal in the same way,
 * and more so: it is about an action that has already finished. Folding it into the union
 * meant every state transition had to remember to carry or drop it, and the one that
 * forgot is what shipped.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long a confirmation stays on screen.
 *
 * Long enough to read a sentence naming a lecture — "Added "1. Foundations"." — without
 * having to hurry, short enough not to sit over the pane while someone works. An import of
 * several files produces the longest message there is, which is what this is sized for.
 */
const LINGERS_MS = 6000;

/** A confirmation and its identity. */
interface Notice {
  readonly text: string;
  /**
   * Distinguishes two confirmations that read the same.
   *
   * Importing the same file twice produces the same sentence, and without this the second
   * one would be the same object, the effect below would not re-run, and the message would
   * vanish on the first timer rather than resetting.
   */
  readonly id: number;
}

/** What the window needs to show a confirmation. */
export interface NoticeState {
  /** The sentence to show, or `null` for none. */
  readonly text: string | null;
  /** Shows a confirmation, replacing any current one. `null` clears it. */
  readonly show: (text: string | null) => void;
  /** Takes it away now, for someone who has read it and wants the pane back. */
  readonly dismiss: () => void;
}

export function useNotice(lingers: number = LINGERS_MS): NoticeState {
  const [notice, setNotice] = useState<Notice | null>(null);
  const next = useRef(0);

  const show = useCallback((text: string | null) => {
    if (text === null) {
      setNotice(null);

      return;
    }

    next.current += 1;
    setNotice({ text, id: next.current });
  }, []);

  const dismiss = useCallback(() => {
    setNotice(null);
  }, []);

  useEffect(() => {
    if (notice === null) {
      return undefined;
    }

    // Keyed on the notice object, so a new confirmation restarts the clock rather than
    // inheriting what was left of the previous one's.
    const timer = window.setTimeout(dismiss, lingers);

    return () => {
      window.clearTimeout(timer);
    };
  }, [notice, lingers, dismiss]);

  return { text: notice?.text ?? null, show, dismiss };
}
