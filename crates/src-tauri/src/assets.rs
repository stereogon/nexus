//! Images pasted into the notes: keeping them, and letting the window show them.
//!
//! # Why the image arrives as the raw request body
//!
//! A screenshot is megabytes. Sent inside a JSON argument it would cross as an array of
//! numbers — several times its size, parsed element by element. Tauri can carry the bytes
//! as the request body instead; which lecture they belong to rides in one header as JSON,
//! with anything outside ASCII escaped by the window, since a header must be ASCII and a
//! course name need not be.
//!
//! # Which images the window may read
//!
//! The asset protocol starts with an empty scope (`tauri.conf.json`). Opening a lecture's
//! notes adds that lecture's `assets/` folder — not the bundle, not the vault — so a note
//! can show the pictures pasted into it and nothing else on the disk.

use std::path::Path;

use lecture_core::{Clock, RelativePath};
use lecture_fs::{AssetSave, AssetStore, AtomicFsStorage, SystemClock, VaultRoot, assets_dir};
use serde::Deserialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

use crate::vault::CommandError;

/// The header naming the lecture an image belongs to.
pub const LECTURE_HEADER: &str = "x-nexus-lecture";

/// Which lecture, as the window sends it in [`LECTURE_HEADER`].
#[derive(Debug, PartialEq, Eq, Deserialize)]
pub struct Lecture {
    /// The vault root.
    pub vault: String,
    /// The lecture's directory inside it.
    pub directory: String,
}

/// Reads the lecture header, or `None` if it is not the JSON the window sends.
///
/// The window escapes everything outside ASCII as `\uXXXX`, because a header must be ASCII;
/// JSON's own escapes bring the original characters back here.
#[must_use]
pub fn lecture_from_header(value: &str) -> Option<Lecture> {
    serde_json::from_str(value).ok()
}

const UNREADABLE_PASTE: CommandError = CommandError {
    code: "ERR_PASTE_UNREADABLE",
    remediation: "That image did not arrive in a form Nexus could read, and nothing was \
                  saved. Try copying it again.",
};

/// Keeps a pasted image in the lecture's `assets/` folder, returning where the notes
/// should point — or why it was not kept.
///
/// # Errors
///
/// Returns [`CommandError`] if the request is malformed, if the lecture cannot be found,
/// or if the write fails. An image that is not one, or is too large, is **not** an error:
/// it is answered with a refusal for the window to explain.
#[tauri::command]
pub async fn save_asset(app: AppHandle, request: Request<'_>) -> Result<AssetSave, CommandError> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(UNREADABLE_PASTE);
    };
    let lecture: Lecture = request
        .headers()
        .get(LECTURE_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(lecture_from_header)
        .ok_or(UNREADABLE_PASTE)?;

    let bytes = bytes.clone();
    let (vault, directory) = (lecture.vault.clone(), lecture.directory.clone());

    let saved = tauri::async_runtime::spawn_blocking(move || {
        store_asset(&vault, &directory, &bytes, &SystemClock)
    })
    .await
    .map_err(|_| CommandError {
        code: "ERR_PASTE_INTERRUPTED",
        remediation: "Saving the image stopped before it finished. Nothing was added to \
                      your notes; paste it again.",
    })??;

    // The folder may have just been created; the scope names it either way.
    allow_assets(&app, &lecture.vault, &lecture.directory)?;

    Ok(saved)
}

/// The blocking half of [`save_asset`], which is also the testable one.
///
/// # Errors
///
/// See [`save_asset`].
pub fn store_asset(
    vault: &str,
    directory: &str,
    bytes: &[u8],
    clock: &impl Clock,
) -> Result<AssetSave, CommandError> {
    let store = AssetStore::new(AtomicFsStorage::new(VaultRoot::open(Path::new(vault))?));

    Ok(store.save(&RelativePath::parse(directory)?, bytes, &clock.now()?)?)
}

/// Lets the window read images in one lecture's `assets/` folder, and nothing beside it.
///
/// # Errors
///
/// Returns [`CommandError`] if the folder does not resolve safely inside the vault, or if
/// the permission cannot be granted.
pub fn allow_assets(app: &AppHandle, vault: &str, directory: &str) -> Result<(), CommandError> {
    let root = VaultRoot::open(Path::new(vault))?;
    let folder = root.resolve(&assets_dir(&RelativePath::parse(directory)?)?)?;

    app.asset_protocol_scope()
        .allow_directory(folder.as_path(), false)
        .map_err(|_| CommandError {
            code: "ERR_IMAGES_UNREADABLE",
            remediation: "Nexus could not give its window permission to show these notes' images. Your \
                          notes are unaffected; reopening them usually clears it.",
        })
}
