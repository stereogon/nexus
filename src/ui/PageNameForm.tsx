/**
 * Naming a new page, from `/page` or `+`'s Page (2026-11-14): one field, in the dialog style
 * of the table picker. Enter makes the page, Escape closes the form with nothing made. If
 * making it fails the form stays open with the name kept and says why, so nothing typed is
 * lost to a refusal.
 */
import { useEffect, useRef, useState } from "react";

import { asCommandError } from "../ipc/vault";

/** The longest name kept; `lecture_core::MAX_PAGE_TITLE_CHARS`. */
const LONGEST = 200;

export function PageNameForm({
  onCreate,
  onClose,
}: {
  /** Makes the page; rejects with a `CommandError` if it could not. */
  readonly onCreate: (title: string) => Promise<void>;
  readonly onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [making, setMaking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const named = title.trim() !== "";

  const create = () => {
    if (!named || making) {
      return;
    }

    setMaking(true);
    setProblem(null);
    onCreate(title.trim()).then(
      () => {
        setMaking(false);
      },
      (thrown: unknown) => {
        setMaking(false);
        setProblem(asCommandError(thrown).remediation);
        field.current?.focus();
      },
    );
  };

  return (
    <div
      className="chart-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        aria-label="New page"
        aria-modal="true"
        className="table-picker page-name-form"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
        role="dialog"
      >
        <h2 className="chart-form-title">New page</h2>
        <label className="page-name-field">
          <span>Name</span>
          <input
            maxLength={LONGEST}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            placeholder="Leader election ideas"
            ref={field}
            type="text"
            value={title}
          />
        </label>
        <p className="page-name-hint">It lives inside this note, and its link goes where the cursor was.</p>
        {problem !== null && (
          <p className="page-name-problem" role="alert">
            {problem}
          </p>
        )}
        <div className="chart-form-actions">
          <button className="secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button disabled={!named || making} type="submit">
            {making ? "Making…" : "Make page"}
          </button>
        </div>
      </form>
    </div>
  );
}
