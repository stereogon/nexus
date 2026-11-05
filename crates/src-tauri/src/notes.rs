//! Reading and saving a lecture's `notes.md`.
//!
//! A thin adapter over `lecture_fs::NotesStore`, which is where the rule that matters
//! lives: a save carries the version it was based on, and a file that changed since is
//! reported as a conflict rather than overwritten. Why, and the edge cases, are in that
//! module.

use std::path::Path;

use lecture_core::RelativePath;
use lecture_fs::{AtomicFsStorage, Notes, NotesSave, NotesStore, VaultRoot};
use tauri::AppHandle;

use crate::assets::allow_assets;
use crate::vault::CommandError;

/// A lecture's notes and the version they were read at.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the lecture cannot be read, or if `notes.md`
/// is not text — in which case it has been copied aside, and nothing has been changed.
///
/// Also lets the window show the images in this lecture's `assets/` folder; see
/// `crate::assets` for why that folder and no other.
#[tauri::command]
pub async fn load_notes(
    app: AppHandle,
    vault: String,
    directory: String,
) -> Result<Notes, CommandError> {
    let (from, at) = (vault.clone(), directory.clone());
    let notes = tauri::async_runtime::spawn_blocking(move || read_notes(&from, &at))
        .await
        .map_err(|_| CommandError {
            code: "ERR_NOTES_INTERRUPTED",
            remediation: "Reading the notes stopped before it finished. Nothing was changed; \
                          try opening the lecture again.",
        })??;

    allow_assets(&app, &vault, &directory)?;

    Ok(notes)
}

/// Saves a lecture's notes, if the file is still at the version they were based on.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the lecture cannot be read, if `notes.md` is
/// not text, or if the write fails — in which case the previous file is left as it was. A
/// file that changed since `based_on` is **not** an error: it is answered with a
/// conflict and what the file holds now, and nothing is written.
#[tauri::command]
pub async fn save_notes(
    vault: String,
    directory: String,
    text: String,
    based_on: String,
) -> Result<NotesSave, CommandError> {
    tauri::async_runtime::spawn_blocking(move || write_notes(&vault, &directory, &text, &based_on))
        .await
        .map_err(|_| CommandError {
            code: "ERR_NOTES_INTERRUPTED",
            remediation: "Saving the notes stopped before it finished. What you typed is still \
                      in the editor; it will be saved again.",
        })?
}

fn store(vault: &str) -> Result<NotesStore, CommandError> {
    Ok(NotesStore::new(AtomicFsStorage::new(VaultRoot::open(
        Path::new(vault),
    )?)))
}

/// The blocking half of [`load_notes`], which is also the testable one.
///
/// # Errors
///
/// See [`load_notes`].
pub fn read_notes(vault: &str, directory: &str) -> Result<Notes, CommandError> {
    Ok(store(vault)?.load(&RelativePath::parse(directory)?)?)
}

/// The blocking half of [`save_notes`], which is also the testable one.
///
/// # Errors
///
/// See [`save_notes`].
pub fn write_notes(
    vault: &str,
    directory: &str,
    text: &str,
    based_on: &str,
) -> Result<NotesSave, CommandError> {
    Ok(store(vault)?.save(&RelativePath::parse(directory)?, text, based_on)?)
}
