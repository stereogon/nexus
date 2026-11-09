//! Moving a folder, with everything in it, into another folder (2026-11-09), for dragging in
//! the sidebar. The item-at-a-time move is `folders::move_under`; this is the same rename on
//! disk, for a directory that holds items rather than being one.
//!
//! Refused, never half done: a folder cannot go into itself or one of its own folders, and
//! nothing inside it may end up deeper than the vault walk looks (`MAX_BUNDLE_DEPTH`), since
//! an item there would vanish from the sidebar. `rename` refuses an occupied target, so a
//! move never lands on something already there. The reading places remembered on this
//! device follow every item inside, as they follow a single item.

use std::path::Path;

use lecture_core::{CoreError, LectureBundle, MAX_BUNDLE_DEPTH, RelativePath};
use lecture_fs::{VaultRoot, state_base};
use serde::Serialize;

use crate::folders::{blocking, folder_in, open, placed};
use crate::reorganize::follow_the_moves;
use crate::vault::CommandError;

/// A folder after a move, and whether its items' remembered places could follow them.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovedFolder {
    /// The folder where it now is.
    pub folder: String,
    /// Why the places left open in it could not follow, when they could not. The move
    /// happened either way, so this is reported beside it rather than raised.
    pub place_lost: Option<CommandError>,
}

/// Moves the folder `folder` into `into` (`""` for the top of the vault).
///
/// # Errors
///
/// See [`move_folder_under`].
#[tauri::command]
pub async fn move_folder(
    vault: String,
    folder: String,
    into: String,
) -> Result<MovedFolder, CommandError> {
    blocking(move || {
        let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

        move_folder_under(&state_base(Path::new(&home)), &vault, &folder, &into)
    })
    .await
}

/// Whether `path` is somewhere inside `folder`.
fn inside(path: &RelativePath, folder: &RelativePath) -> bool {
    path.depth() > folder.depth()
        && path
            .segments()
            .zip(folder.segments())
            .all(|(one, other)| one == other)
}

/// `path`, inside `from`, as it is once `from` is at `to`.
fn relocated(
    path: &RelativePath,
    from: &RelativePath,
    to: &RelativePath,
) -> Result<RelativePath, CommandError> {
    let rest = RelativePath::from_segments(path.segments().skip(from.depth()).cloned().collect())?;

    Ok(to.join(&rest)?)
}

/// The blocking half of [`move_folder`], which is also the testable one.
///
/// # Errors
///
/// `ERR_NOT_A_FOLDER` if either folder is gone (or is the top of the vault, which cannot be
/// moved); `ERR_FOLDER_INTO_ITSELF` for a folder dropped on itself or inside itself;
/// `ERR_FOLDER_TOO_DEEP` if anything in it would end up deeper than the vault walk looks;
/// `ERR_NAME_ALREADY_HERE` if the destination holds that name already; and what the rename
/// returns.
pub fn move_folder_under(
    base: &Path,
    vault: &str,
    folder: &str,
    into: &str,
) -> Result<MovedFolder, CommandError> {
    let (storage, loaded) = open(vault)?;
    let from = folder_in(&loaded, folder)?.ok_or(CommandError {
        code: "ERR_NOT_A_FOLDER",
        remediation: "The top of the vault cannot be moved. Choose a folder inside it.",
    })?;
    let destination = folder_in(&loaded, into)?;

    if destination
        .as_ref()
        .is_some_and(|place| place == &from || inside(place, &from))
    {
        return Err(CommandError {
            code: "ERR_FOLDER_INTO_ITSELF",
            remediation: "A folder cannot go inside itself. Drop it on a folder outside it.",
        });
    }

    let to = placed(destination.as_ref(), from.name().clone())?;

    if to == from {
        return Ok(MovedFolder {
            folder: to.to_string(),
            place_lost: None,
        });
    }

    // The deepest thing inside, items and folders alike, measured from the folder.
    let deepest = loaded
        .bundles
        .iter()
        .map(LectureBundle::directory)
        .chain(loaded.folders.iter())
        .filter(|path| inside(path, &from))
        .map(|path| path.depth() - from.depth())
        .max()
        .unwrap_or(0);

    if to.depth() + deepest > MAX_BUNDLE_DEPTH {
        return Err(CommandError {
            code: "ERR_FOLDER_TOO_DEEP",
            remediation: "Folders can be nested five deep, and what is inside this one would \
                          go past that there. Put it in a folder higher up instead.",
        });
    }

    if storage.exists(&to)? {
        return Err(CommandError {
            code: "ERR_NAME_ALREADY_HERE",
            remediation: "That folder already has something with this name in it. Rename one \
                          of them first.",
        });
    }

    storage.rename(&from, &to)?;

    let moves = loaded
        .bundles
        .iter()
        .filter(|bundle| inside(bundle.directory(), &from))
        .map(|bundle| {
            Ok((
                bundle.directory().clone(),
                relocated(bundle.directory(), &from, &to)?,
            ))
        })
        .collect::<Result<Vec<_>, CommandError>>()?;
    let root = VaultRoot::open(Path::new(vault))?;
    let place_lost = follow_the_moves(base, &root, &moves);

    Ok(MovedFolder {
        folder: to.to_string(),
        place_lost,
    })
}
