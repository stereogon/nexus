//! An item's pages: listing, making, opening, saving and deleting them (2026-11-14).
//!
//! A thin adapter over `lecture_fs::PageStore`, which keeps a save from overwriting a page
//! that changed elsewhere, as `notes` does for `notes.md`. A page is named by the item's
//! directory and its id; the directory is parsed as a `RelativePath` like any other path
//! from the window, so nothing outside the vault can be named.
//!
//! Deleting a page moves its file, and those of every page inside it, into the vault's
//! `.trash`, as deleting an item moves its folder (`trash`), so a slip loses nothing.

use std::path::Path;

use lecture_core::{
    Clock, IdSource, PageHeader, PageId, RelativePath, Slug, page_and_descendants, page_title,
};
use lecture_fs::{
    AtomicFsStorage, Notes, NotesSave, PageStore, PageSummary, PagesListing, SystemClock,
    SystemIds, VaultRoot, page_path,
};
use tauri::AppHandle;

use crate::assets::allow_assets;
use crate::folders::blocking;
use crate::trash::{TRASH_DIR_NAME, free_name};
use crate::vault::CommandError;

const PAGE_NOT_FOUND: CommandError = CommandError {
    code: "ERR_PAGE_NOT_FOUND",
    remediation: "That page is no longer in this item. It may have been deleted on another \
                  device or in Finder; its link can be removed from the note.",
};

/// Every page of the item at `directory`.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the item's `pages` folder cannot be read. A
/// page file that cannot be read is counted, not an error.
#[tauri::command]
pub async fn list_pages(vault: String, directory: String) -> Result<PagesListing, CommandError> {
    blocking(move || Ok(store(&vault)?.list(&RelativePath::parse(&directory)?)?)).await
}

/// Makes an empty page named `title` in the item at `directory`, inside the page `parent`
/// or directly in the item's notes.
///
/// # Errors
///
/// Returns [`CommandError`] if the name is blank or too long, if `parent` is not a page of
/// this item, or if the file cannot be written.
#[tauri::command]
pub async fn create_page(
    vault: String,
    directory: String,
    title: String,
    parent: Option<String>,
) -> Result<PageSummary, CommandError> {
    blocking(move || make_page(&vault, &directory, &title, parent.as_deref())).await
}

/// A page's body and the version of its file. Also lets the window show the item's images,
/// which a page links as the notes do.
///
/// # Errors
///
/// Returns [`CommandError`] if the page is not there, cannot be read, or is damaged — in
/// which case it has been copied aside, and nothing changed.
#[tauri::command]
pub async fn load_page(
    app: AppHandle,
    vault: String,
    directory: String,
    page: String,
) -> Result<Notes, CommandError> {
    let (from, at) = (vault.clone(), directory.clone());
    let notes = blocking(move || read_page(&from, &at, &page)).await?;

    allow_assets(&app, &vault, &directory)?;
    Ok(notes)
}

/// Saves a page's body, if its file is still at the version it was based on; otherwise
/// answers with a conflict and what the page holds now, writing nothing.
///
/// # Errors
///
/// Returns [`CommandError`] if the page is not there, cannot be read, or the write fails —
/// in which case the previous file is left as it was.
#[tauri::command]
pub async fn save_page(
    vault: String,
    directory: String,
    page: String,
    text: String,
    based_on: String,
) -> Result<NotesSave, CommandError> {
    blocking(move || write_page(&vault, &directory, &page, &text, &based_on)).await
}

/// Moves a page, and every page inside it, into the vault's `.trash`, returning the ids of
/// the pages moved.
///
/// # Errors
///
/// Returns [`CommandError`] if the page is not there or a move fails. Pages are moved
/// deepest first, so a failure part way leaves no page whose parent has gone.
#[tauri::command]
pub async fn delete_page(
    vault: String,
    directory: String,
    page: String,
) -> Result<Vec<String>, CommandError> {
    blocking(move || trash_page(&vault, &directory, &page)).await
}

/// The blocking half of [`create_page`], which is also the testable one.
///
/// # Errors
///
/// See [`create_page`].
pub fn make_page(
    vault: &str,
    directory: &str,
    title: &str,
    parent: Option<&str>,
) -> Result<PageSummary, CommandError> {
    let store = store(vault)?;
    let bundle = RelativePath::parse(directory)?;
    let parent = parent.map(PageId::parse).transpose()?;

    if let Some(parent) = &parent
        && !store
            .list(&bundle)?
            .pages
            .iter()
            .any(|page| page.id == parent.as_str())
    {
        return Err(PAGE_NOT_FOUND);
    }

    let header = PageHeader {
        title: page_title(title)?,
        parent,
        created: SystemClock.now()?,
    };
    let id = PageId::parse(SystemIds::new().fresh()?.as_str())?;

    Ok(store.create(&bundle, &id, &header)?)
}

/// The blocking half of [`load_page`].
///
/// # Errors
///
/// See [`load_page`].
pub fn read_page(vault: &str, directory: &str, page: &str) -> Result<Notes, CommandError> {
    store(vault)?
        .load(&RelativePath::parse(directory)?, &PageId::parse(page)?)?
        .ok_or(PAGE_NOT_FOUND)
}

/// The blocking half of [`save_page`].
///
/// # Errors
///
/// See [`save_page`].
pub fn write_page(
    vault: &str,
    directory: &str,
    page: &str,
    text: &str,
    based_on: &str,
) -> Result<NotesSave, CommandError> {
    store(vault)?
        .save(
            &RelativePath::parse(directory)?,
            &PageId::parse(page)?,
            text,
            based_on,
        )?
        .ok_or(PAGE_NOT_FOUND)
}

/// The blocking half of [`delete_page`].
///
/// # Errors
///
/// See [`delete_page`].
pub fn trash_page(vault: &str, directory: &str, page: &str) -> Result<Vec<String>, CommandError> {
    let storage = AtomicFsStorage::new(VaultRoot::open(Path::new(vault))?);
    let bundle = RelativePath::parse(directory)?;
    let root = PageId::parse(page)?;
    let listing = PageStore::new(storage.clone()).list(&bundle)?;
    let parents: Vec<(PageId, Option<PageId>)> = listing
        .pages
        .iter()
        .filter_map(|summary| {
            let parent = summary
                .parent
                .as_deref()
                .map(PageId::parse)
                .transpose()
                .ok()?;

            Some((PageId::parse(&summary.id).ok()?, parent))
        })
        .collect();

    if !parents.iter().any(|(id, _)| id == &root) {
        return Err(PAGE_NOT_FOUND);
    }

    let trash = RelativePath::root_level(Slug::internal(TRASH_DIR_NAME)?);
    storage.create_dir(&trash)?;

    let doomed = page_and_descendants(&parents, &root);

    for id in doomed.iter().rev() {
        let from = page_path(&bundle, id)?;

        storage.rename(&from, &free_name(&storage, &trash, &from)?)?;
    }

    Ok(doomed.iter().map(|id| id.as_str().to_owned()).collect())
}

fn store(vault: &str) -> Result<PageStore, CommandError> {
    Ok(PageStore::new(AtomicFsStorage::new(VaultRoot::open(
        Path::new(vault),
    )?)))
}
