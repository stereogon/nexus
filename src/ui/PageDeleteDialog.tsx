/**
 * Asking before a page is deleted (2026-11-14, the "Pages" row of the redesign canvas). It
 * counts the pages inside, which go with it, and says its link goes too. Deleted pages move
 * to the vault's `.trash`, as a deleted item does, so a slip can be undone in Finder.
 *
 * Cancel has the focus at first, so an Enter meant for something else deletes nothing.
 */
import { useEffect, useRef, useState } from "react";

import type { PageSummary } from "../ipc/pages";
import { asCommandError } from "../ipc/vault";

export function PageDeleteDialog({
  page,
  inside,
  noteTitle,
  onDelete,
  onClose,
}: {
  readonly page: PageSummary;
  /** How many pages are inside it, at any depth. */
  readonly inside: number;
  /** The note its link is in. */
  readonly noteTitle: string;
  /** Deletes it; rejects with a `CommandError` if it could not. */
  readonly onDelete: () => Promise<void>;
  readonly onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement | null>(null);
  const total = inside + 1;

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  return (
    <div
      className="chart-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) {
          onClose();
        }
      }}
    >
      <div
        aria-label={`Delete ${page.title}`}
        aria-modal="true"
        className="table-picker page-delete"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !deleting) {
            event.preventDefault();
            onClose();
          }
        }}
        role="alertdialog"
      >
        <h2 className="chart-form-title">{`Delete “${page.title}”?`}</h2>
        <p className="page-delete-what">
          {inside === 0 ? "The page is deleted" : `The page and the ${inside === 1 ? "1 page" : `${String(inside)} pages`} inside it are deleted`}
          {`, with their text, and its link in ${noteTitle} goes too. They move to the vault's .trash folder, so they can be taken back out in Finder.`}
        </p>
        {problem !== null && (
          <p className="page-name-problem" role="alert">
            {problem}
          </p>
        )}
        <div className="chart-form-actions">
          <button className="secondary" disabled={deleting} onClick={onClose} ref={cancel} type="button">
            Cancel
          </button>
          <button
            className="danger"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              setProblem(null);
              onDelete().then(
                () => {
                  setDeleting(false);
                },
                (thrown: unknown) => {
                  setDeleting(false);
                  setProblem(asCommandError(thrown).remediation);
                },
              );
            }}
            type="button"
          >
            {total === 1 ? "Delete page" : `Delete ${String(total)} pages`}
          </button>
        </div>
      </div>
    </div>
  );
}
