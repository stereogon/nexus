//! Loading and saving the vault's versioned JSON files.
//!
//! Both `manifest.json` and `annotations.json` are read the same way, and the way they
//! are read is the part of the storage layer most dangerous to get wrong. Two failures
//! look alike and must be handled in **opposite** ways:
//!
//! - A file that is **corrupt** — truncated, hand-edited into nonsense, internally
//!   inconsistent — is copied to `.bak` before anything else happens, so the bytes
//!   someone had survive even if a later repair overwrites the original.
//! - A file **from a newer build** is left strictly alone. No backup, no rewrite,
//!   nothing. It is not damaged; it is simply newer than this reader. Treating it as
//!   corrupt would destroy data an updated Nexus could read perfectly, and on a synced
//!   vault that damage would propagate back to the device that wrote it.
//!
//! That logic lives here once, rather than once per file type, so there is a single
//! place for it to be correct and a single place to test it.

use std::io;

use lecture_core::{BackupOutcome, CoreError, RelativePath, SchemaProbe, SchemaRange};
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::storage::AtomicFsStorage;

/// Reads a versioned JSON file, checking its schema version first.
///
/// # Errors
///
/// Returns [`CoreError::SchemaVersionUnsupported`] for a file from a schema version
/// outside `schema`, having touched nothing at all. For a corrupt or inconsistent one, copies it
/// aside and returns [`CoreError::StoredFileUnreadable`] carrying the parser's message
/// and where the copy went. Also returns [`CoreError::Io`] if the file cannot be read,
/// and a containment error if `path` does not resolve safely inside the vault.
pub(crate) fn load<T: DeserializeOwned>(
    storage: &AtomicFsStorage,
    path: &RelativePath,
    file: &'static str,
    schema: SchemaRange,
) -> Result<T, CoreError> {
    let bytes = storage.read(path)?;

    // The version is read on its own first. A file from a newer build need not
    // deserialise as the current shape at all, so asking the full parser would report it
    // as corrupt -- and corrupt is the one verdict that must not be reached here.
    let probe: SchemaProbe =
        serde_json::from_slice(&bytes).map_err(|e| preserve(storage, path, file, &e))?;

    if !schema.accepts(probe.schema_version) {
        // Deliberately before any backup and without writing anything.
        return Err(schema.reject(file, probe.schema_version));
    }

    // An older but readable version needs no transformation here. Every field version 1
    // lacked is optional, and absent is precisely what version 1 meant by it, so the
    // value parsed below is already the upgrade. The file itself is rewritten at the
    // current version by the next save, because `Into<Raw…>` always writes the current
    // version -- so reading never writes, and the migration lands the first time
    // something legitimately changes the file.
    //
    // A future version that *retypes* a field cannot work this way and will need its own
    // raw struct per version. Deliberately not built yet: there is nothing for it to do,
    // and a pipeline with one empty stage is harder to get right later than an honest
    // special case is to replace.

    serde_json::from_slice::<T>(&bytes).map_err(|e| preserve(storage, path, file, &e))
}

/// Writes a versioned JSON file through the atomic path.
///
/// Pretty-printed because people do open these files, and a diff of one changed field
/// should be one changed line rather than an unreadable wall.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if the value cannot be serialised or the write fails. A
/// failed write leaves the previous file exactly as it was.
pub(crate) fn save<T: Serialize>(
    storage: &AtomicFsStorage,
    path: &RelativePath,
    value: &T,
) -> Result<(), CoreError> {
    let mut json = serde_json::to_vec_pretty(value).map_err(|error| CoreError::Io {
        operation: "prepare",
        path: path.to_string(),
        source: io::Error::other(error),
    })?;
    json.push(b'\n');

    storage.write(path, &json)
}

/// Whether a failure was simply that the file is not there.
///
/// `annotations.json` is absent in every freshly imported bundle, so its store treats
/// this as an empty set rather than an error. Decided by inspecting the error rather
/// than by checking existence first, which would leave a window in which the answer
/// changed between the check and the read.
pub(crate) fn is_missing(error: &CoreError) -> bool {
    matches!(error, CoreError::Io { source, .. } if source.kind() == io::ErrorKind::NotFound)
}

/// Copies a damaged file aside and describes what went wrong.
///
/// The parser's own message is carried through, line and column included: "could not be
/// read" on its own is not something anyone can act on, whereas a position turns a
/// broken hand-edit into a ten-second fix.
///
/// A failure to make the copy does not replace the real error, because the caller still
/// needs to hear why the file could not be read. It is reported alongside it instead, so
/// the message never claims a `.bak` that is not there.
fn preserve(
    storage: &AtomicFsStorage,
    path: &RelativePath,
    file: &'static str,
    error: &serde_json::Error,
) -> CoreError {
    let backup = match storage.back_up(path) {
        Ok(at) => BackupOutcome::Saved(at.display().to_string()),
        Err(_) => BackupOutcome::Failed,
    };

    CoreError::StoredFileUnreadable {
        file,
        detail: error.to_string(),
        backup,
    }
}
