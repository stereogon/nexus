//! Reading and writing `manifest.json`.
//!
//! The JSON lives here rather than in `lecture-core` because the serialisation format is
//! an adapter concern: the domain owns the *shape* and its invariants, this owns the
//! bytes. That also keeps `serde_json` out of the crate that has to compile for iOS.
//!
//! # The distinction this module exists to get right
//!
//! Two failures look similar and must be handled in opposite ways:
//!
//! - A manifest that is **corrupt** — truncated, hand-edited into nonsense, inconsistent
//!   — is copied to `.bak` before anything else happens, so the bytes someone had are
//!   preserved even if a later repair overwrites the original.
//! - A manifest **from a newer build** is left strictly alone. No backup, no rewrite,
//!   nothing. It is not damaged; it is simply newer than this reader. Treating it as
//!   corrupt would destroy data that an updated Nexus could read perfectly, and on a
//!   synced vault that damage would propagate to the device that wrote it.

use lecture_core::{
    BackupOutcome, Clock, CoreError, MANIFEST_FILE_NAME, Manifest, RelativePath, SchemaProbe, Slug,
};

use crate::storage::AtomicFsStorage;

/// Reads and writes bundle manifests.
pub struct ManifestStore<C> {
    storage: AtomicFsStorage,
    clock: C,
}

impl<C: Clock> ManifestStore<C> {
    /// Wraps storage and a clock.
    ///
    /// The clock is held rather than passed per call so that saving *cannot* forget to
    /// update the modification time.
    pub fn new(storage: AtomicFsStorage, clock: C) -> Self {
        Self { storage, clock }
    }

    /// The storage this writes through.
    pub fn storage(&self) -> &AtomicFsStorage {
        &self.storage
    }

    /// Loads the manifest of the bundle at `bundle`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::ManifestVersionUnsupported`] for a manifest from another
    /// schema version, having touched nothing at all. For a corrupt or inconsistent one,
    /// copies it aside and returns [`CoreError::ManifestUnreadable`] carrying the
    /// parser's message and where the copy went. Also returns [`CoreError::Io`] if the
    /// file cannot be read, and a containment error if `bundle` does not resolve safely
    /// inside the vault.
    pub fn load(&self, bundle: &RelativePath) -> Result<Manifest, CoreError> {
        let path = manifest_path(bundle)?;
        let bytes = self.storage.read(&path)?;

        // The version is read on its own first. A manifest from a newer build need not
        // deserialise as the current shape at all, so asking the full parser would
        // report it as corrupt -- and corrupt is the one verdict that must not be
        // reached here.
        let probe: SchemaProbe =
            serde_json::from_slice(&bytes).map_err(|error| self.preserve(&path, &error))?;

        if probe.schema_version != lecture_core::CURRENT_SCHEMA_VERSION {
            // Deliberately before any backup and without writing anything.
            return Err(CoreError::ManifestVersionUnsupported {
                found: probe.schema_version,
                supported: lecture_core::CURRENT_SCHEMA_VERSION,
            });
        }

        serde_json::from_slice::<Manifest>(&bytes).map_err(|error| self.preserve(&path, &error))
    }

    /// Saves `manifest` into the bundle at `bundle`, stamping it as changed now.
    ///
    /// Returns the manifest as written, so the caller holds the same state as the disk
    /// rather than a copy with a stale timestamp.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidTimestamp`] if the machine clock is unusable,
    /// [`CoreError::InvalidManifest`] if it reads earlier than the bundle's creation
    /// time, and [`CoreError::Io`] if the write fails. A failed write leaves the previous
    /// manifest exactly as it was.
    pub fn save(&self, bundle: &RelativePath, manifest: &Manifest) -> Result<Manifest, CoreError> {
        let stamped = manifest.touched(self.clock.now()?)?;
        let path = manifest_path(bundle)?;

        // Pretty-printed because people do open these files, and a diff of one changed
        // field should be one changed line rather than an unreadable wall.
        let mut json = serde_json::to_vec_pretty(&stamped).map_err(|error| CoreError::Io {
            operation: "prepare the manifest for",
            path: path.to_string(),
            source: std::io::Error::other(error),
        })?;
        json.push(b'\n');

        self.storage.write(&path, &json)?;
        Ok(stamped)
    }

    /// Copies a damaged manifest aside and describes what went wrong.
    ///
    /// The parser's own message is carried through, line and column included: "could not
    /// be read" on its own is not something anyone can act on, whereas a position turns
    /// a broken hand-edit into a ten-second fix.
    ///
    /// A failure to make the copy does not replace the real error, because the caller
    /// still needs to hear why the file could not be read. It is reported alongside it
    /// instead, so the message never claims a `.bak` that is not there.
    fn preserve(&self, path: &RelativePath, error: &serde_json::Error) -> CoreError {
        let backup = match self.storage.back_up(path) {
            Ok(at) => BackupOutcome::Saved(at.display().to_string()),
            Err(_) => BackupOutcome::Failed,
        };

        CoreError::ManifestUnreadable {
            detail: error.to_string(),
            backup,
        }
    }
}

/// `<bundle>/manifest.json`.
fn manifest_path(bundle: &RelativePath) -> Result<RelativePath, CoreError> {
    bundle.child(Slug::parse(MANIFEST_FILE_NAME)?)
}
