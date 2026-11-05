//! Images dropped onto the notes: read from where they are, kept like a pasted one.
//!
//! A drop arrives as paths, not bytes (`ipc/dragdrop.ts` says why), so the window cannot
//! send the image the way a paste does. This reads the file the person dropped and hands
//! its bytes to the same store a paste goes through, which judges them by their own bytes
//! — a file named `.png` that is not one is refused there, as a pasted one is.
//!
//! The size is checked from the file's metadata before anything is read, and the read is
//! bounded too, so a dropped video is turned away without loading gigabytes to do it.

use std::fs::File;
use std::io::Read;
use std::path::Path;

use lecture_core::{Clock, MAX_ASSET_BYTES};
use lecture_fs::{AssetSave, Refusal, SystemClock};
use tauri::AppHandle;

use crate::assets::{allow_assets, store_asset};
use crate::vault::CommandError;

const UNREADABLE_DROP: CommandError = CommandError {
    code: "ERR_DROPPED_IMAGE_UNREADABLE",
    remediation: "Nexus could not read the file that was dropped, so nothing was added to \
                  your notes. If it is on a disk that was removed or a folder Nexus cannot \
                  open, copy it somewhere local and drop it again.",
};

/// Keeps an image dropped onto the notes in the lecture's `assets/` folder, returning
/// where the notes should point — or why it was not kept.
///
/// # Errors
///
/// Returns [`CommandError`] if the file cannot be read, if the lecture cannot be found,
/// or if the write fails. A file that is not an image, or is too large, is **not** an
/// error: it is answered with a refusal for the window to explain.
#[tauri::command]
pub async fn save_dropped_image(
    app: AppHandle,
    vault: String,
    directory: String,
    path: String,
) -> Result<AssetSave, CommandError> {
    let (root, bundle) = (vault.clone(), directory.clone());

    let saved = tauri::async_runtime::spawn_blocking(move || {
        keep_dropped_image(&root, &bundle, Path::new(&path), &SystemClock)
    })
    .await
    .map_err(|_| CommandError {
        code: "ERR_PASTE_INTERRUPTED",
        remediation: "Saving the image stopped before it finished. Nothing was added to \
                      your notes; drop it again.",
    })??;

    allow_assets(&app, &vault, &directory)?;

    Ok(saved)
}

/// The blocking half of [`save_dropped_image`], which is also the testable one.
///
/// # Errors
///
/// See [`save_dropped_image`].
pub fn keep_dropped_image(
    vault: &str,
    directory: &str,
    file: &Path,
    clock: &impl Clock,
) -> Result<AssetSave, CommandError> {
    let opened = File::open(file).map_err(|_| UNREADABLE_DROP)?;
    let metadata = opened.metadata().map_err(|_| UNREADABLE_DROP)?;

    if !metadata.is_file() {
        return Err(UNREADABLE_DROP);
    }

    let limit = u64::try_from(MAX_ASSET_BYTES).unwrap_or(u64::MAX);

    if metadata.len() > limit {
        return Ok(AssetSave::Refused {
            reason: Refusal::TooLarge,
        });
    }

    // One byte past the limit, so a file that grew after the check is still caught by the
    // store's own size rule rather than read without end.
    let mut bytes = Vec::new();
    opened
        .take(limit.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|_| UNREADABLE_DROP)?;

    store_asset(vault, directory, &bytes, clock)
}
