//! The temporary file an atomic write is built in before it replaces anything.
//!
//! Writing in place truncates the existing file first, so a crash or a full disk
//! halfway through leaves a file that is neither the old content nor the new one. That
//! is the one failure this app must never have: someone's notes, half gone. So every
//! write is built in a staging file alongside the target, flushed to the platter, and
//! then moved over the target in a single `rename`, which is atomic on APFS. A reader
//! arriving at any moment sees either the whole old file or the whole new one.
//!
//! [`StagingFile`] is an RAII guard: if it is dropped without being committed — an
//! error on the way, an early return — it removes its own temporary file, so a failed
//! write leaves nothing behind to confuse the next one.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use lecture_core::CoreError;

use crate::error::{io_error, render};

/// Breaks ties between two writes landing in the same nanosecond in one process.
static SEQUENCE: AtomicU16 = AtomicU16::new(0);

/// The longest a staging suffix can be, in bytes.
///
/// Fixed-width by construction: `.tmp.` plus 16 hex digits of timestamp, 8 of process
/// id and 4 of sequence. `Slug` caps names at 200 bytes on the stated basis that
/// staging adds no more than 41, and a test here holds this to that promise, so the two
/// numbers cannot drift apart unnoticed.
pub(crate) const SUFFIX_BYTES: usize = 5 + 16 + 8 + 4;

/// `Slug` caps names at 200 bytes on the stated basis that staging adds no more than 41.
/// Checked here at compile time, so the two constants cannot drift apart: if this suffix
/// ever grows past the budget, the build stops rather than a save failing on someone's
/// longest lecture title.
const _: () = assert!(SUFFIX_BYTES <= 41);
const _: () = assert!(200 + SUFFIX_BYTES <= 255);

/// A staging file that cleans up after itself unless it is committed.
pub(crate) struct StagingFile {
    path: PathBuf,
    handle: Option<File>,
    committed: bool,
}

impl StagingFile {
    /// Creates a staging file beside `target`.
    ///
    /// Created with `create_new`, so the open fails rather than overwrites if the name
    /// is somehow already taken. Uniqueness is therefore enforced by the kernel, not
    /// merely assumed from the suffix.
    pub(crate) fn create(target: &Path) -> Result<Self, CoreError> {
        let path = staging_path(target)?;

        let handle = OpenOptions::new()
            .write(true)
            .create_new(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(&path)
            .map_err(|e| io_error("create a temporary file beside", target, e))?;

        Ok(Self {
            path,
            handle: Some(handle),
            committed: false,
        })
    }

    /// Writes the whole payload into the staging file.
    pub(crate) fn write_all(&mut self, bytes: &[u8]) -> Result<(), CoreError> {
        // Destructured so the path and the handle are borrowed as separate fields; a
        // method call taking `&self` would borrow the whole struct and conflict.
        let Self { path, handle, .. } = self;

        let Some(open) = handle.as_mut() else {
            return Err(already_closed(path));
        };

        open.write_all(bytes)
            .map_err(|e| io_error("write to the temporary file", path, e))
    }

    /// Flushes the contents to the device, then closes the handle.
    ///
    /// This must happen before the rename. Without it the rename can reach the disk
    /// first and a power loss would leave the target pointing at an empty file —
    /// trading a half-written file for an empty one, which is no better.
    pub(crate) fn sync(&mut self) -> Result<(), CoreError> {
        let Self { path, handle, .. } = self;

        if let Some(open) = handle.as_ref() {
            open.sync_all()
                .map_err(|e| io_error("flush the temporary file", path, e))?;
        } else {
            return Err(already_closed(path));
        }

        // Dropped here so the rename below operates on a closed file.
        *handle = None;
        Ok(())
    }

    /// Moves the staging file over `target`.
    ///
    /// # Known limitation
    ///
    /// The parent directory is flushed afterwards so the rename itself is durable, but
    /// macOS `fsync` does not force the drive to empty its own write cache; that needs
    /// `F_FULLFSYNC`, which `std` does not expose and which would mean `unsafe`.
    /// So "durable" here means the OS has it, not that it has survived a power cut.
    /// Recorded in `PROGRESS.md`.
    pub(crate) fn commit(mut self, target: &Path) -> Result<(), CoreError> {
        fs::rename(&self.path, target)
            .map_err(|e| io_error("move the finished file into place at", target, e))?;

        // Set before the directory flush: the staging file no longer exists under its
        // old name, so there is nothing for the drop guard to remove either way.
        self.committed = true;

        let parent = target
            .parent()
            .ok_or_else(|| CoreError::InvalidRelativePath {
                path: render(target),
                reason: "has no containing folder to flush",
            })?;

        let directory =
            File::open(parent).map_err(|e| io_error("open the folder containing", target, e))?;

        directory
            .sync_all()
            .map_err(|e| io_error("flush the folder containing", target, e))
    }
}

/// Raised if a staging file is written to or flushed after being closed.
///
/// Unreachable through the public API, which drives the sequence in one function, but it
/// is a typed error rather than a panic so a future caller cannot turn a sequencing
/// mistake into a crash while someone is saving.
fn already_closed(path: &Path) -> CoreError {
    CoreError::InvalidRelativePath {
        path: render(path),
        reason: "the temporary file was already closed",
    }
}

impl Drop for StagingFile {
    fn drop(&mut self) {
        if self.committed {
            return;
        }

        // The result is deliberately discarded, and this is the one place in the
        // codebase where that is correct: `drop` cannot report anything, and raising a
        // cleanup failure here would mask the real error that caused the early return.
        // A leftover `.tmp.` file is inert, obviously ours by name, and removed by the
        // next successful write to the same target.
        drop(fs::remove_file(&self.path));
    }
}

/// Builds the staging path beside `target`.
fn staging_path(target: &Path) -> Result<PathBuf, CoreError> {
    let parent = target
        .parent()
        .ok_or_else(|| CoreError::InvalidRelativePath {
            path: render(target),
            reason: "has no containing folder to write into",
        })?;

    let file_name = target
        .file_name()
        .ok_or_else(|| CoreError::InvalidRelativePath {
            path: render(target),
            reason: "does not name a file",
        })?;

    // Built as an `OsString` rather than through a lossy string conversion, so the
    // staging name is exactly the target name plus the suffix.
    let mut staging_name = file_name.to_os_string();
    staging_name.push(suffix());

    Ok(parent.join(staging_name))
}

/// A suffix no other concurrent or past write will produce.
fn suffix() -> String {
    // A clock set backwards cannot collide here, because the process id and sequence
    // still differ; the timestamp only spreads names out, it is not relied on for
    // uniqueness. `create_new` is what actually guarantees it.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    let truncated = u64::try_from(nanos & u128::from(u64::MAX)).unwrap_or(0);

    let process = std::process::id();
    let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);

    format!(".tmp.{truncated:016x}{process:08x}{sequence:04x}")
}

#[cfg(test)]
mod tests {
    use super::{SUFFIX_BYTES, suffix};

    #[test]
    fn suffix_is_the_width_the_budget_assumes() {
        // The budget itself is asserted at compile time above. What a test can add is
        // that the formatting actually produces that width — a change to the format
        // string would otherwise slip past the constant.
        assert_eq!(suffix().len(), SUFFIX_BYTES);
    }

    #[test]
    fn successive_suffixes_differ() {
        let first = suffix();
        let second = suffix();

        assert_ne!(first, second, "the sequence counter should break the tie");
    }
}
