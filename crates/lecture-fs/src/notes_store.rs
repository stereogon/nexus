//! Reading and writing a lecture's `notes.md`.
//!
//! # Why a save says what it was based on
//!
//! `notes.md` is the file in a bundle that holds what someone *typed*, and it lives in a
//! synced folder. Another device, or another editor on this one, can change it while it is
//! open here. A save that simply wrote the window's text would erase that change, and
//! `CLAUDE.md` §1.4 names losing someone's typing as the worst bug this app can have.
//!
//! So a load returns a **version** — a fingerprint of the bytes read — and a save carries
//! the version it was based on. If the file on disk no longer matches it, nothing is
//! written and the caller is told what is there now. That is an outcome to handle, not a
//! failure: neither side's typing is lost, and the window decides what to show.
//!
//! There is a window between that check and the rename in which another writer could
//! still land a change. It is milliseconds wide against a sync client's seconds; closing
//! it needs file locking across sync clients, which do not honour locks.
//!
//! A missing file and an empty one share a version. Both mean "no notes yet", and keeping
//! them apart would report a conflict the first time an empty file appeared — from an
//! import, or from another device — when nobody had typed anything.

use lecture_core::{
    BackupOutcome, CoreError, NOTES_FILE_NAME, RelativePath, Slug, fingerprint_hex,
};
use serde::Serialize;

use crate::storage::AtomicFsStorage;
use crate::versioned::is_missing;

/// A lecture's notes, and the version they were read at.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notes {
    /// The Markdown, exactly as stored.
    pub text: String,
    /// Fingerprint of the bytes read. Sent back with a save.
    pub version: String,
}

/// What became of a save.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum NotesSave {
    /// Written. The new version is what the next save should be based on.
    Saved {
        /// The version of what was just written.
        version: String,
    },
    /// The file changed since the version the save was based on, so nothing was written.
    #[serde(rename_all = "camelCase")]
    Conflict {
        /// What the file holds now.
        on_disk: Notes,
    },
}

/// Reads and writes `notes.md` through the atomic path.
pub struct NotesStore {
    storage: AtomicFsStorage,
}

impl NotesStore {
    /// Wraps storage.
    #[must_use]
    pub fn new(storage: AtomicFsStorage) -> Self {
        Self { storage }
    }

    /// The notes of the bundle at `bundle`; empty, not an error, if it has none yet.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::StoredFileUnreadable`] if the file is not UTF-8 text, having
    /// copied it aside first. It is never decoded with replacement characters: the next
    /// save would write those back, and the original bytes would be gone. Also returns
    /// [`CoreError::Io`] if the file cannot be read, and a containment error if `bundle`
    /// does not resolve safely inside the vault.
    pub fn load(&self, bundle: &RelativePath) -> Result<Notes, CoreError> {
        let path = notes_path(bundle)?;

        let bytes = match self.storage.read(&path) {
            Ok(bytes) => bytes,
            Err(error) if is_missing(&error) => Vec::new(),
            Err(error) => return Err(error),
        };
        let version = fingerprint_hex(&bytes);

        match String::from_utf8(bytes) {
            Ok(text) => Ok(Notes { text, version }),
            Err(error) => {
                let backup = match self.storage.back_up(&path) {
                    Ok(at) => BackupOutcome::Saved(at.display().to_string()),
                    Err(_) => BackupOutcome::Failed,
                };

                Err(CoreError::StoredFileUnreadable {
                    file: NOTES_FILE_NAME,
                    detail: format!(
                        "it is not UTF-8 text (the first unreadable byte is at position {})",
                        error.utf8_error().valid_up_to()
                    ),
                    backup,
                })
            }
        }
    }

    /// Writes `text` as the notes of `bundle`, if the file is still at `based_on`.
    ///
    /// # Errors
    ///
    /// See [`load`](Self::load) — a file that cannot be read is never overwritten — and
    /// [`CoreError::Io`] if the write fails, leaving the previous file exactly as it was.
    pub fn save(
        &self,
        bundle: &RelativePath,
        text: &str,
        based_on: &str,
    ) -> Result<NotesSave, CoreError> {
        let current = self.load(bundle)?;

        if current.version != based_on {
            return Ok(NotesSave::Conflict { on_disk: current });
        }

        self.storage.write(&notes_path(bundle)?, text.as_bytes())?;

        Ok(NotesSave::Saved {
            version: fingerprint_hex(text.as_bytes()),
        })
    }
}

/// `<bundle>/notes.md`.
fn notes_path(bundle: &RelativePath) -> Result<RelativePath, CoreError> {
    bundle.child(Slug::parse(NOTES_FILE_NAME)?)
}
