/**
 * The Pages button in the notes header, and the panel it opens (2026-11-14, the "Pages" row
 * of the redesign canvas): the pages directly inside the note on screen.
 *
 * Each says whether its link is still in the note's text. One whose link was taken out has
 * nowhere else to be found but here and search, so it offers "Link here", which puts the
 * link back at the cursor. Each can be deleted, which asks first (`PageDeleteDialog`).
 */
import { useState } from "react";

import type { PageSummary } from "../ipc/pages";
import { LinkIcon, PageIcon, TrashIcon } from "./icons";
import type { MenuAt } from "./menuPlacement";
import { under } from "./PopMenu";
import { useDismissOutside } from "./usePopover";
import { useFloating } from "./useFloating";

export interface PagesInNote {
  /** The note's name, for the panel's label. */
  readonly noteTitle: string;
  /** The pages directly inside it, in the order they were made. */
  readonly pages: readonly PageSummary[];
  /** How many pages each holds, at any depth. */
  readonly inside: (id: string) => number;
  /** The pages the note's text links to. */
  readonly linked: ReadonlySet<string>;
  /** Files in `pages/` that could not be read, for the whole item. */
  readonly unreadable: number;
  readonly onOpen: (id: string) => void;
  readonly onLinkHere: (page: PageSummary) => void;
  readonly onDelete: (page: PageSummary) => void;
}

/** The button, and the panel while it is open. */
export function PagesControl({ note }: { readonly note: PagesInNote }) {
  const [at, setAt] = useState<MenuAt | null>(null);
  const count = note.pages.length;

  return (
    <>
      <button
        aria-expanded={at !== null}
        aria-haspopup="dialog"
        aria-label={`Pages, ${String(count)}`}
        className="notes-pages-button"
        data-opens="pages"
        onClick={(event) => {
          const control = event.currentTarget;

          setAt((open) => (open === null ? under(control, "right", 340) : null));
        }}
        title="The pages inside this note"
        type="button"
      >
        <PageIcon />
        <span>Pages</span>
        <span className="notes-pages-count">{count}</span>
      </button>
      {at !== null && (
        <PagesPanel
          at={at}
          note={note}
          onDismiss={() => {
            setAt(null);
          }}
        />
      )}
    </>
  );
}

function PagesPanel({ at, note, onDismiss }: { readonly at: MenuAt; readonly note: PagesInNote; readonly onDismiss: () => void }) {
  const { box, placed } = useFloating(at, onDismiss);

  useDismissOutside(box, "pages", onDismiss);

  return (
    <div aria-label={`Pages in ${note.noteTitle}`} className="pages-panel" ref={box} role="dialog" style={{ left: placed.left, top: placed.top }}>
      <p className="pages-panel-title">Pages in this note</p>
      {note.pages.length === 0 ? (
        <p className="pages-panel-empty">
          None yet. Type <span className="kbd">/page</span> in the note to make one here.
        </p>
      ) : (
        <ul className="pages-panel-list">
          {note.pages.map((page) => {
            const inside = note.inside(page.id);

            return (
              <li className="pages-panel-item" key={page.id}>
                <PageIcon />
                <span className="pages-panel-what">
                  <button
                    className="pages-panel-open"
                    onClick={() => {
                      onDismiss();
                      note.onOpen(page.id);
                    }}
                    type="button"
                  >
                    {page.title}
                  </button>
                  {inside > 0 && <span className="pages-panel-inside">{inside === 1 ? "1 page inside" : `${String(inside)} pages inside`}</span>}
                </span>
                {note.linked.has(page.id) ? (
                  <span className="pages-panel-state">In the text</span>
                ) : (
                  <button
                    className="pages-panel-link"
                    onClick={() => {
                      onDismiss();
                      note.onLinkHere(page);
                    }}
                    title="Put this page's link back at the cursor"
                    type="button"
                  >
                    <LinkIcon />
                    Link here
                  </button>
                )}
                <button
                  aria-label={`Delete ${page.title}`}
                  className="chrome-icon pages-panel-delete"
                  onClick={() => {
                    onDismiss();
                    note.onDelete(page);
                  }}
                  title="Delete this page"
                  type="button"
                >
                  <TrashIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="pages-panel-foot">
        A page whose link was taken out of the text stays here. <strong>Link here</strong> puts its link back at the cursor.
      </p>
      {note.unreadable > 0 && (
        <p className="pages-panel-foot">
          {note.unreadable === 1 ? "One file" : `${String(note.unreadable)} files`} in this item's pages folder could not be read as a page,
          and were left as they are.
        </p>
      )}
    </div>
  );
}
