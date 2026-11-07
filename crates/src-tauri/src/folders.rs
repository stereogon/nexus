//! Folders, and the items made in them or moved between them.
//!
//! The sidebar steps through the vault's real folders, so a folder is where something
//! *is* rather than a facet it is tagged with: making a note or importing a document while
//! a folder is open puts it in that folder, and moving an item is a rename on disk.
//!
//! Which directories count as folders is the vault walk's answer, not a rule made here: a
//! folder is a directory the walk descended into without finding a manifest, which already
//! excludes the inside of every bundle and anything hidden. This module only looks it up.

use std::path::Path;

use lecture_core::{
    Clock, CoreError, Label, LectureBundle, MAX_BUNDLE_DEPTH, Manifest, OrderKey, RelativePath,
    Slug,
};
use lecture_fs::{
    AtomicFsStorage, LoadedVault, ManifestStore, SystemClock, VaultLoader, VaultRoot, state_base,
};
use serde::Serialize;

use crate::reorganize::follow_the_moves;
use crate::vault::{CommandError, LectureRow, row};

/// An item after a move, and whether its remembered place could follow it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovedItem {
    /// The item where it now is.
    pub item: LectureRow,
    /// Why the place it was left open at could not follow it, when it could not. The move
    /// itself happened either way, so this is reported beside it rather than raised.
    pub place_lost: Option<CommandError>,
}

/// Makes an empty folder named `name` inside `parent` (`""` for the top of the vault).
///
/// # Errors
///
/// Returns [`CommandError`] if the name is not usable, `parent` is not a folder, the folder
/// would be nested too deeply to hold anything, or something of that name is already there.
#[tauri::command]
pub async fn create_folder(
    vault: String,
    parent: String,
    name: String,
) -> Result<String, CommandError> {
    blocking(move || make_folder(&vault, &parent, &name)).await
}

/// Makes a plain note titled `title` inside `parent`.
///
/// # Errors
///
/// As [`create_folder`], with `title` in place of the name.
#[tauri::command]
pub async fn create_note(
    vault: String,
    parent: String,
    title: String,
) -> Result<LectureRow, CommandError> {
    blocking(move || make_note(&vault, &parent, &title)).await
}

/// Moves the item at `directory` into `folder` (`""` for the top of the vault).
///
/// # Errors
///
/// Returns [`CommandError`] if the item or the folder is not there, or the folder already
/// holds something of the same name.
#[tauri::command]
pub async fn move_item(
    vault: String,
    directory: String,
    folder: String,
) -> Result<MovedItem, CommandError> {
    blocking(move || {
        let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

        move_under(&state_base(Path::new(&home)), &vault, &directory, &folder)
    })
    .await
}

/// The blocking half of [`create_folder`], which is also the testable one.
///
/// # Errors
///
/// See [`create_folder`].
pub fn make_folder(vault: &str, parent: &str, name: &str) -> Result<String, CommandError> {
    let (storage, loaded) = open(vault)?;
    let path = placed(
        folder_in(&loaded, parent)?.as_ref(),
        Slug::parse(name.trim())?,
    )?;

    refuse_taken(&storage, &path)?;
    storage.create_dir(&path)?;

    Ok(path.to_string())
}

/// The blocking half of [`create_note`].
///
/// # Errors
///
/// See [`create_note`].
pub fn make_note(vault: &str, parent: &str, title: &str) -> Result<LectureRow, CommandError> {
    let (storage, loaded) = open(vault)?;
    let title = Label::parse(title.trim())?;
    let path = placed(
        folder_in(&loaded, parent)?.as_ref(),
        Slug::from_title(title.as_str())?,
    )?;

    refuse_taken(&storage, &path)?;

    // After everything already there, as an import with no number is placed.
    let sequence = OrderKey::between(
        loaded
            .bundles
            .iter()
            .map(|held| held.manifest().sequence())
            .max(),
        None,
    )?;
    let manifests = ManifestStore::new(storage, SystemClock);
    let note = Manifest::note(title, sequence, SystemClock.now()?);

    manifests.storage().create_dir(&path)?;
    let saved = manifests.save(&path, &note)?;

    Ok(row(&LectureBundle::new(path, saved)))
}

/// The blocking half of [`move_item`], with this device's state kept under `base`.
///
/// # Errors
///
/// See [`move_item`].
pub fn move_under(
    base: &Path,
    vault: &str,
    directory: &str,
    folder: &str,
) -> Result<MovedItem, CommandError> {
    let (storage, loaded) = open(vault)?;
    let from = RelativePath::parse(directory)?;
    let held = loaded
        .bundles
        .iter()
        .find(|bundle| bundle.directory() == &from)
        .ok_or(CommandError {
            code: "ERR_ITEM_NOT_FOUND",
            remediation: "That item is no longer where Nexus last saw it. It may have been \
                          moved or deleted in Finder; the list has been refreshed.",
        })?;
    let destination = folder_in(&loaded, folder)?;
    let to = placed(destination.as_ref(), from.name().clone())?;

    if to == from {
        return Ok(MovedItem {
            item: row(held),
            place_lost: None,
        });
    }

    // `rename` refuses an occupied target, so this can never land on another item.
    storage.rename(&from, &to)?;

    let root = VaultRoot::open(Path::new(vault))?;
    let place_lost = follow_the_moves(base, &root, &[(from, to.clone())]);

    Ok(MovedItem {
        item: row(&held.relocated(to)),
        place_lost,
    })
}

/// The folder `raw` names (`""` for the top of the vault), if the walk found it as one.
///
/// # Errors
///
/// Returns [`CommandError`] if `raw` is not one of the vault's folders, which includes
/// the inside of a document or note.
pub fn folder_in(loaded: &LoadedVault, raw: &str) -> Result<Option<RelativePath>, CommandError> {
    if raw.is_empty() {
        return Ok(None);
    }

    let path = RelativePath::parse(raw)?;

    if loaded.folders.contains(&path) {
        Ok(Some(path))
    } else {
        Err(CommandError {
            code: "ERR_NOT_A_FOLDER",
            remediation: "That folder is no longer in the vault. It may have been renamed \
                          or removed in Finder; the list has been refreshed, so choose \
                          the folder again.",
        })
    }
}

/// Where something called `name` goes inside `parent`.
///
/// # Errors
///
/// Returns [`CommandError`] if `parent` is already as deep as anything may be nested,
/// since what was put there would not be found by the vault walk.
pub fn placed(parent: Option<&RelativePath>, name: Slug) -> Result<RelativePath, CommandError> {
    match parent {
        None => Ok(RelativePath::root_level(name)),
        Some(folder) if folder.depth() >= MAX_BUNDLE_DEPTH => Err(CommandError {
            code: "ERR_FOLDER_TOO_DEEP",
            remediation: "Folders can be nested five deep, and this one is already at the \
                          limit. Put it in a folder higher up instead.",
        }),
        Some(folder) => Ok(folder.child(name)?),
    }
}

/// Refuses a path something already holds, so nothing is made on top of it.
fn refuse_taken(storage: &AtomicFsStorage, path: &RelativePath) -> Result<(), CommandError> {
    if storage.exists(path)? {
        return Err(CommandError {
            code: "ERR_NAME_ALREADY_HERE",
            remediation: "Something with this name is already in this folder. Choose a \
                          different name.",
        });
    }

    Ok(())
}

pub(crate) fn open(vault: &str) -> Result<(AtomicFsStorage, LoadedVault), CommandError> {
    let root = VaultRoot::open(Path::new(vault))?;
    let loaded = VaultLoader::new(ManifestStore::new(
        AtomicFsStorage::new(root.clone()),
        SystemClock,
    ))
    .load()?;

    Ok((AtomicFsStorage::new(root), loaded))
}

/// Runs `work` off the main thread, as every command that touches the disk does.
pub(crate) async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| CommandError {
            code: "ERR_INTERRUPTED",
            remediation: "Nexus stopped before it finished. Nothing was changed; try again.",
        })?
}
