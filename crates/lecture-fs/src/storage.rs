//! The storage surface the rest of the app uses.
//!
//! [`AtomicFsStorage`] owns a [`VaultRoot`] and takes [`VaultRelativePath`]s rather than
//! filesystem paths. Containment is therefore re-checked inside every call, and a caller
//! holding only a vault path has no way to reach the disk without it. That is the point:
//! the guarantee is in the signature, not in a convention someone has to follow.
//!
//! Every write goes through a staging file and a `rename`, so a failure leaves the
//! previous contents exactly as they were. Nothing here truncates a file in place.

use std::fs;
use std::io::Read;
use std::os::unix::fs::OpenOptionsExt;
use std::path::PathBuf;

use lecture_core::{CoreError, VaultRelativePath};

use crate::error::io_error;
use crate::staging::StagingFile;
use crate::vault_root::{ResolvedPath, VaultRoot};

/// The suffix given to a file that could not be understood.
const BACKUP_SUFFIX: &str = ".bak";

/// Atomic, containment-checked file storage for one vault.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtomicFsStorage {
    root: VaultRoot,
}

impl AtomicFsStorage {
    /// Wraps an opened vault root.
    #[must_use]
    pub fn new(root: VaultRoot) -> Self {
        Self { root }
    }

    /// The vault this storage writes into.
    #[must_use]
    pub fn root(&self) -> &VaultRoot {
        &self.root
    }

    /// Replaces the contents of `at` with `bytes`, atomically.
    ///
    /// The previous contents survive untouched unless the whole write succeeds. There is
    /// no window in which `at` holds a partial file.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::SymlinkRefused`] or [`CoreError::PathEscapesVault`] if `at`
    /// does not resolve safely inside the vault, and [`CoreError::Io`] if any step of
    /// the write fails.
    pub fn write(&self, at: &VaultRelativePath, bytes: &[u8]) -> Result<(), CoreError> {
        let resolved = self.root.resolve(at)?;
        write_bytes(&resolved, bytes)
    }

    /// Reads the contents of `at`.
    ///
    /// Opened with `O_NOFOLLOW`, so a symbolic link swapped in after the containment
    /// check is refused by the kernel rather than followed. That narrows the
    /// time-of-check/time-of-use window noted on [`VaultRoot::resolve`].
    ///
    /// Honest caveat: the flag's effect is **not** demonstrated by any test. Every
    /// symlink reachable through this API is already refused by `resolve` one step
    /// earlier, so the flag only ever fires inside the race window, which a
    /// single-threaded test cannot open. The symlink tests in `tests/storage.rs` prove
    /// `resolve`, not this. Recorded in `PROGRESS.md`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the file cannot be opened or read, including when it
    /// has been replaced by a link, and a containment error if `at` does not resolve
    /// safely.
    pub fn read(&self, at: &VaultRelativePath) -> Result<Vec<u8>, CoreError> {
        let resolved = self.root.resolve(at)?;
        let path = resolved.as_path();

        let mut handle = fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(path)
            .map_err(|e| io_error("open", path, e))?;

        let mut bytes = Vec::new();
        handle
            .read_to_end(&mut bytes)
            .map_err(|e| io_error("read", path, e))?;

        Ok(bytes)
    }

    /// Whether `at` exists.
    ///
    /// # Errors
    ///
    /// Returns a containment error if `at` does not resolve safely inside the vault. A
    /// path that resolves but is absent is `Ok(false)`, not an error.
    pub fn exists(&self, at: &VaultRelativePath) -> Result<bool, CoreError> {
        let resolved = self.root.resolve(at)?;
        Ok(resolved.as_path().exists())
    }

    /// Creates the directory `at`, and any missing directories above it.
    ///
    /// Succeeds if it is already there, so callers do not need to check first.
    ///
    /// # Errors
    ///
    /// Returns a containment error if `at` does not resolve safely, or
    /// [`CoreError::Io`] if creation fails.
    pub fn create_dir(&self, at: &VaultRelativePath) -> Result<(), CoreError> {
        let resolved = self.root.resolve(at)?;
        let path = resolved.as_path();

        fs::create_dir_all(path).map_err(|e| io_error("create the folder", path, e))
    }

    /// Copies `at` aside to `<name>.bak`, returning where it went.
    ///
    /// Called when a file parses but makes no sense, or does not parse at all. The
    /// unreadable original is preserved rather than discarded, so nothing a person wrote
    /// is lost to a schema change or a hand-edit that went wrong — they can open the
    /// `.bak` in any editor and retrieve what was in it.
    ///
    /// Only the most recent backup is kept, which is the contract `CLAUDE.md` §1.4
    /// states. A second failure overwrites the first, and that is correct: by then the
    /// first backup's content has already been superseded by whatever the app wrote in
    /// its place.
    ///
    /// # Errors
    ///
    /// Returns a containment error if `at` does not resolve safely, or
    /// [`CoreError::Io`] if the original cannot be read or the backup cannot be written.
    pub fn back_up(&self, at: &VaultRelativePath) -> Result<PathBuf, CoreError> {
        let bytes = self.read(at)?;

        let resolved = self.root.resolve(at)?;
        let backup = resolved.with_name_suffix(BACKUP_SUFFIX)?;

        // Written through the same atomic path as everything else, so a crash midway
        // cannot leave a truncated backup standing in for the original.
        write_bytes(&backup, &bytes)?;

        Ok(backup.as_path().to_path_buf())
    }
}

/// Writes `bytes` to `resolved` via a staging file and a rename.
fn write_bytes(resolved: &ResolvedPath, bytes: &[u8]) -> Result<(), CoreError> {
    let path = resolved.as_path();

    let mut staging = StagingFile::create(path)?;
    staging.write_all(bytes)?;
    staging.sync()?;
    staging.commit(path)
}
