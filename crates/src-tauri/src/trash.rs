//! Deleting a document or note, by moving it into the vault's `.trash` folder.
//!
//! Chosen with the user on 2026-11-07 over the macOS Trash (which needed a new crate) and
//! over deleting outright (a slip would lose notes). `.trash` is hidden, so the vault walk
//! skips it and the item leaves the sidebar, and getting it back is dragging its folder out
//! in Finder. It is *not* `.nexus/`, which holds only what a scan can rebuild (§3); a
//! deleted item is the opposite of that.
//!
//! The item moves whole — document, original, notes, highlights, images — through the
//! rename that refuses an occupied target, so nothing in `.trash` is ever written over.

use lecture_core::{RelativePath, Slug};

use crate::folders::{blocking, open};
use crate::vault::CommandError;

/// The folder deleted items go to, at the top of the vault.
pub const TRASH_DIR_NAME: &str = ".trash";

/// How many names to try before giving up on finding a free one.
const MAX_ATTEMPTS: u32 = 100;

/// Moves the item at `directory` into the vault's `.trash`, returning where it went.
///
/// # Errors
///
/// Returns [`CommandError`] if the item is not there or the move fails; in either case the
/// item is left where it was.
#[tauri::command]
pub async fn delete_item(vault: String, directory: String) -> Result<String, CommandError> {
    blocking(move || move_to_trash(&vault, &directory)).await
}

/// The blocking half of [`delete_item`], which is also the testable one.
///
/// # Errors
///
/// See [`delete_item`].
pub fn move_to_trash(vault: &str, directory: &str) -> Result<String, CommandError> {
    let (storage, loaded) = open(vault)?;
    let from = RelativePath::parse(directory)?;

    if !loaded
        .bundles
        .iter()
        .any(|bundle| bundle.directory() == &from)
    {
        return Err(CommandError {
            code: "ERR_ITEM_NOT_FOUND",
            remediation: "That item is no longer where Nexus last saw it. It may have been \
                          moved or deleted in Finder; the list has been refreshed.",
        });
    }

    let trash = RelativePath::root_level(Slug::internal(TRASH_DIR_NAME)?);
    storage.create_dir(&trash)?;

    let to = free_name(&storage, &trash, &from)?;
    storage.rename(&from, &to)?;

    Ok(to.to_string())
}

/// A name in `.trash` nothing holds yet: the item's path with its folders joined by ` - `,
/// so `CS454/Week 3/raft` is `CS454 - Week 3 - raft` and says where it came from, then
/// ` 2`, ` 3` … when something deleted earlier already has it.
pub(crate) fn free_name(
    storage: &lecture_fs::AtomicFsStorage,
    trash: &RelativePath,
    from: &RelativePath,
) -> Result<RelativePath, CommandError> {
    let joined = from
        .segments()
        .map(Slug::as_str)
        .collect::<Vec<_>>()
        .join(" - ");
    // A joined path can pass the name length cap; the item's own name always fits.
    let base = if Slug::parse(&joined).is_ok() {
        joined
    } else {
        from.name().as_str().to_owned()
    };

    for attempt in 1..=MAX_ATTEMPTS {
        let name = if attempt == 1 {
            base.clone()
        } else {
            format!("{base} {attempt}")
        };
        let candidate = trash.child(Slug::parse(&name)?)?;

        if !storage.exists(&candidate)? {
            return Ok(candidate);
        }
    }

    Err(CommandError {
        code: "ERR_TRASH_FULL_OF_THAT_NAME",
        remediation: "The vault's .trash folder already holds a hundred items of this name, \
                      so nothing was deleted. Empty some of them in Finder, then try again.",
    })
}
