//! Reading and writing `manifest.json`.
//!
//! The JSON lives here rather than in `lecture-core` because the serialisation format is
//! an adapter concern: the domain owns the *shape* and its invariants, this owns the
//! bytes. That also keeps `serde_json` out of the crate that has to compile for iOS.
//!
//! The corrupt-versus-newer asymmetry that governs loading is in [`crate::versioned`],
//! shared with `annotations.json`.

use lecture_core::{
    CURRENT_SCHEMA_VERSION, Clock, CoreError, MANIFEST_FILE_NAME, Manifest, RelativePath, Slug,
};

use crate::storage::AtomicFsStorage;
use crate::versioned;

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
    /// See [`versioned::load`]. A manifest is *required*, so a missing file is an error
    /// here — unlike `annotations.json`, whose absence is normal.
    pub fn load(&self, bundle: &RelativePath) -> Result<Manifest, CoreError> {
        let path = manifest_path(bundle)?;
        versioned::load(
            &self.storage,
            &path,
            MANIFEST_FILE_NAME,
            CURRENT_SCHEMA_VERSION,
        )
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

        versioned::save(&self.storage, &path, &stamped)?;
        Ok(stamped)
    }
}

/// `<bundle>/manifest.json`.
fn manifest_path(bundle: &RelativePath) -> Result<RelativePath, CoreError> {
    bundle.child(Slug::parse(MANIFEST_FILE_NAME)?)
}
