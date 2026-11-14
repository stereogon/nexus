/**
 * An item's pages, across the IPC boundary (2026-11-14): notes that live inside its notes,
 * kept at `pages/<id>.md` in its folder. Rust's `pages` commands; the shapes are pinned by
 * `fixtures/pages.json`, which Rust writes from the real store.
 *
 * A page's body loads and saves as `notes.md` does — a save says which version it was based
 * on, and a file changed since is answered with a conflict — so the same schemas carry it.
 */
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import { NotesSaveSchema, NotesSchema, type Notes, type NotesSave } from "./notes";

export const PageSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** The page it is inside; `null` for one directly in the item's notes. */
  parent: z.string().min(1).nullable(),
  created: z.string(),
  /** The highlights it cites. */
  cites: z.array(z.string()),
});

export const PagesListingSchema = z.object({
  /** In the order they were made. */
  pages: z.array(PageSummarySchema),
  /** Files in `pages/` that could not be read as pages. */
  unreadable: z.number().int().nonnegative(),
});

export type PageSummary = z.infer<typeof PageSummarySchema>;
export type PagesListing = z.infer<typeof PagesListingSchema>;

/** Every page of the item at `directory`. */
export async function listPages(vault: string, directory: string): Promise<PagesListing> {
  return PagesListingSchema.parse(await invoke("list_pages", { vault, directory }));
}

/**
 * Makes an empty page named `title`, inside the page `parent` or directly in the item's notes.
 *
 * @throws {CommandError} if the name is blank or too long, or `parent` is not a page here.
 */
export async function createPage(vault: string, directory: string, title: string, parent: string | null): Promise<PageSummary> {
  return PageSummarySchema.parse(await invoke("create_page", { vault, directory, title, parent }));
}

/** A page's body and the version it was read at. */
export async function loadPage(vault: string, directory: string, page: string): Promise<Notes> {
  return NotesSchema.parse(await invoke("load_page", { vault, directory, page }));
}

/** Saves a page's body if its file is still at `basedOn`; otherwise says what it holds. */
export async function savePage(vault: string, directory: string, page: string, text: string, basedOn: string): Promise<NotesSave> {
  return NotesSaveSchema.parse(await invoke("save_page", { vault, directory, page, text, basedOn }));
}

/** Moves a page and every page inside it to the vault's `.trash`, resolving to their ids. */
export async function deletePage(vault: string, directory: string, page: string): Promise<string[]> {
  return z.array(z.string()).parse(await invoke("delete_page", { vault, directory, page }));
}
