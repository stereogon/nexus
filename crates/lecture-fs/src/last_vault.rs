//! Which vault this device had open last.
//!
//! # Why it is not in the vault, and not in `.nexus/`
//!
//! `~/Library/Application Support/Nexus/last-vault.txt`.
//!
//! `CLAUDE.md` §3 makes "can a vault scan rebuild it?" the test for `.nexus/`, and this
//! fails it twice over. A scan cannot know which vault someone last chose, and more
//! simply: this names *which* vault, so it cannot live inside one. It is also the right
//! answer for sync — two devices each keep their own last-opened vault, and neither has an
//! opinion about the other's.
//!
//! # Why a line of text rather than JSON
//!
//! One value with no schema to version. [`crate::device_state`] uses JSON because
//! `ViewState` has fields that will grow; a single path has nowhere to grow to, and a
//! versioned envelope around it would be ceremony with no payoff. The cost is a real
//! limit, recorded rather than hidden: a vault directory whose name *ends* in a newline
//! does not round-trip through this file. Reading back one character less of a 255-byte
//! directory name is not a risk worth a schema.

use std::fs;
use std::path::{Path, PathBuf};

use lecture_core::{CoreError, RelativePath, Slug};

use crate::device_state::state_base;
use crate::error::io_error;
use crate::storage::AtomicFsStorage;
use crate::vault_root::VaultRoot;

/// Names the vault to reopen on launch.
pub const LAST_VAULT_FILE_NAME: &str = "last-vault.txt";

/// Records `vault` as the one to reopen, under `base`.
///
/// Written atomically, like everything else: a half-written path would send the next
/// launch to a directory that does not exist, and the recovery for that is worse than the
/// cost of a temp file.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if `base` cannot be created or the write fails.
pub fn remember(base: &Path, vault: &VaultRoot) -> Result<(), CoreError> {
    fs::create_dir_all(base).map_err(|e| io_error("create the app support folder", base, e))?;

    let storage = AtomicFsStorage::new(VaultRoot::open(base)?);
    let note = format!("{}\n", vault.path().display());

    storage.write(&file_path()?, note.as_bytes())
}

/// The vault to reopen, if one was recorded and is still there.
///
/// Infallible by design. Every way this can fail — nothing recorded yet, a file that will
/// not read, a vault since moved, renamed or deleted — has the same answer, which is to ask
/// the person which vault they want. None of them is a fault to report, so none of them is
/// an error to return; a launch that refused to proceed because of a stale breadcrumb would
/// be strictly worse than one that shows the picker.
///
/// The directory is checked for existence here rather than left to [`VaultRoot::open`], so
/// the common case of a moved vault costs a `stat` instead of an error the caller has to
/// recognise and discard.
#[must_use]
pub fn recall(base: &Path) -> Option<PathBuf> {
    let storage = AtomicFsStorage::new(VaultRoot::open(base).ok()?);
    let bytes = storage.read(&file_path().ok()?).ok()?;
    let text = String::from_utf8(bytes).ok()?;

    // Only the trailing newline this module writes is removed. Trimming all whitespace
    // would quietly rewrite a directory name that legitimately ends in a space.
    let recorded = text.trim_end_matches('\n');
    let path = PathBuf::from(recorded);

    if recorded.is_empty() || !path.is_dir() {
        return None;
    }

    Some(path)
}

/// Records `vault` in the real Application Support directory.
///
/// # Errors
///
/// As [`remember`], plus [`CoreError::HomeDirectoryUnavailable`] if `HOME` is unset.
pub fn remember_for_this_device(vault: &VaultRoot) -> Result<(), CoreError> {
    let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

    remember(&state_base(Path::new(&home)), vault)
}

/// The vault to reopen, from the real Application Support directory.
#[must_use]
pub fn recall_for_this_device() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;

    recall(&state_base(Path::new(&home)))
}

/// `last-vault.txt`, at the top of the app's own folder.
fn file_path() -> Result<RelativePath, CoreError> {
    RelativePath::from_segments(vec![Slug::internal(LAST_VAULT_FILE_NAME)?])
}
