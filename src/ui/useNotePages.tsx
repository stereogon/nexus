/**
 * What the notes pane does with pages (2026-11-14): names where the open page is, fills the
 * Pages panel for the note on screen, makes a page from `/page`, and deletes one after
 * asking. The listing and which note is open belong to the item (`useItemPages`); this is
 * the pane's side of them.
 */
import { useState, type ReactNode, type RefObject } from "react";

import { createPage, deletePage, type PageSummary } from "../ipc/pages";
import { pageLink } from "../notes/pageLinks";
import type { Crumb } from "./NotesHeader";
import type { NotesHandle } from "./NotesEditor";
import { PageDeleteDialog } from "./PageDeleteDialog";
import type { PagesInNote } from "./PagesPanel";
import { pagesIn, pagesInside, pathTo } from "./pageTree";
import type { ItemPages } from "./useItemPages";

export interface NotePages {
  /** From the item's notes down to the page open; empty while the item's own notes are. */
  readonly trail: readonly Crumb[];
  /** The name of the note on screen. */
  readonly noteTitle: string;
  readonly panel: PagesInNote;
  /** The delete confirmation, while one is asked. */
  readonly dialog: ReactNode;
  /** Makes a page named `title` inside the note on screen, resolving to its link. */
  readonly makePage: (title: string) => Promise<string>;
}

export function useNotePages({
  vault,
  directory,
  item,
  itemTitle,
  linked,
  editor,
}: {
  readonly vault: string;
  readonly directory: string;
  readonly item: ItemPages;
  readonly itemTitle: string;
  /** The pages the note on screen links to. */
  readonly linked: ReadonlySet<string>;
  readonly editor: RefObject<NotesHandle | null>;
}): NotePages {
  const [deleting, setDeleting] = useState<PageSummary | null>(null);
  const path = item.open === null ? [] : pathTo(item.pages, item.open);
  const trail: Crumb[] = path.length === 0 ? [] : [{ note: null, title: itemTitle }, ...path.map((page) => ({ note: page.id, title: page.title }))];
  const noteTitle = path.at(-1)?.title ?? itemTitle;
  const inside = (id: string) => pagesInside(item.pages, id);

  const panel: PagesInNote = {
    noteTitle,
    pages: pagesIn(item.pages, item.open),
    inside,
    linked,
    unreadable: item.unreadable,
    onOpen: item.openNote,
    onLinkHere: (page) => {
      editor.current?.insertBlock(pageLink(page.id, page.title));
    },
    onDelete: setDeleting,
  };

  const dialog =
    deleting === null ? null : (
      <PageDeleteDialog
        inside={inside(deleting.id)}
        noteTitle={noteTitle}
        onClose={() => {
          setDeleting(null);
        }}
        onDelete={async () => {
          const gone = await deletePage(vault, directory, deleting.id);

          setDeleting(null);
          editor.current?.removePageLinks(new Set(gone));
          await item.refresh();
        }}
        page={deleting}
      />
    );

  const makePage = async (title: string) => {
    const made = await createPage(vault, directory, title, item.open);

    await item.refresh();
    return pageLink(made.id, made.title);
  };

  return { trail, noteTitle, panel, dialog, makePage };
}
