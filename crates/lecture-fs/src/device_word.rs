//! One word of this device's state in a file of its own, in
//! `~/Library/Application Support/Nexus/`: the window's layout, its font, and whether
//! documents show dark pages (2026-11-14).
//!
//! Each preference keeps its own type and file, and names its words; this is only the
//! reading and writing they share, which had been copied into each of them. The write is
//! atomic, through [`AtomicFsStorage`]; the read is infallible, because every way of failing
//! to read a preference has one answer, its default, and the caller supplies it.

use std::path::{Path, PathBuf};

use lecture_core::{CoreError, RelativePath};

use crate::device_state::state_base;
use crate::error::io_error;
use crate::storage::AtomicFsStorage;
use crate::vault_root::VaultRoot;

/// Writes `word` to `file_name` under `base`, creating `base` if need be.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if `base` cannot be created or the write fails.
pub(crate) fn remember(base: &Path, file_name: &str, word: &str) -> Result<(), CoreError> {
    std::fs::create_dir_all(base)
        .map_err(|e| io_error("create the app support folder", base, e))?;

    let storage = AtomicFsStorage::new(VaultRoot::open(base)?);

    storage.write(
        &RelativePath::parse(file_name)?,
        format!("{word}\n").as_bytes(),
    )
}

/// The word in `file_name` under `base`, trimmed, or `None` if there is none to read.
pub(crate) fn recall(base: &Path, file_name: &str) -> Option<String> {
    let storage = AtomicFsStorage::new(VaultRoot::open(base).ok()?);
    let bytes = storage.read(&RelativePath::parse(file_name).ok()?).ok()?;

    Some(String::from_utf8(bytes).ok()?.trim().to_owned())
}

/// The real Application Support directory for this app.
///
/// # Errors
///
/// Returns [`CoreError::HomeDirectoryUnavailable`] if `HOME` is unset.
pub(crate) fn this_device() -> Result<PathBuf, CoreError> {
    let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

    Ok(state_base(Path::new(&home)))
}
