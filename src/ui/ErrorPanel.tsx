/**
 * The error panel: every error shown since Nexus opened, newest first. ⌘0, or the title
 * bar's button.
 *
 * A side panel beside the document rather than over it, like the lecture editor, so the
 * thing that went wrong stays in view while its explanation is read. Focus moves into it
 * when it opens and back to where it was when it closes, and Escape closes it.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

import { clearErrors, onErrorsChanged, shownErrors } from "./errorLog";

const TIME = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function ErrorPanel({ onClose }: { readonly onClose: () => void }) {
  const errors = useSyncExternalStore(onErrorsChanged, shownErrors);
  const panel = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const came = document.activeElement;

    panel.current?.focus();

    return () => {
      if (came instanceof HTMLElement && came.isConnected) {
        came.focus();
      }
    };
  }, []);

  return (
    <aside
      aria-labelledby="error-panel-heading"
      className="side-panel"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      ref={panel}
      tabIndex={-1}
    >
      <header className="side-panel-head">
        <h2 id="error-panel-heading">Errors</h2>
        <button aria-label="Close the error panel" className="side-panel-close" onClick={onClose} type="button">
          ✕
        </button>
      </header>

      <p className="error-panel-note">
        Every error shown since Nexus opened, newest first. Kept until Nexus quits; the log in
        ~/Library/Logs/Nexus is what lasts.
      </p>

      {errors.length === 0 ? (
        <p className="empty">Nothing has gone wrong since Nexus opened.</p>
      ) : (
        <>
          <ol className="error-panel-list">
            {errors.map((entry, at) => (
              // Position plus time: the same error code can happen twice in one second, and
              // the list only ever grows at the front, so an index alone would reuse keys.
              <li className="error-panel-entry" key={`${String(entry.at.getTime())}:${String(errors.length - at)}`}>
                <time className="error-panel-when" dateTime={entry.at.toISOString()}>
                  {TIME.format(entry.at)}
                </time>
                <div className="code">{entry.error.code}</div>
                <div>{entry.error.remediation}</div>
              </li>
            ))}
          </ol>
          <div className="error-panel-actions">
            <button className="secondary" onClick={clearErrors} type="button">
              Clear
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
