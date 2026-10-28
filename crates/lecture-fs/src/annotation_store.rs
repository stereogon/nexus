//! Reading and writing `annotations.json`.
//!
//! # Why a missing file is not a failure
//!
//! Every bundle has a manifest, so a missing `manifest.json` means something is wrong.
//! `annotations.json` is different: a lecture that has just been imported, or one nobody
//! has highlighted yet, legitimately has no annotations file at all. Loading it must
//! therefore yield an empty set rather than an error, and saving must create the file on
//! first use.
//!
//! This is also why the store does not hold a [`Clock`](lecture_core::Clock) the way
//! [`ManifestStore`](crate::ManifestStore) does. A manifest has one modification time
//! that a save must not forget to stamp; an annotation set has none — each annotation
//! carries its own times, set when that annotation is created or edited. Giving this
//! store a clock would imply a set-level timestamp that does not exist, and a redundant
//! one would be a second thing to disagree after a sync.

use lecture_core::{
    ANNOTATIONS_FILE_NAME, ANNOTATIONS_SCHEMA, AnnotationSet, CoreError, RelativePath, Slug,
};

use crate::storage::AtomicFsStorage;
use crate::versioned;

/// Reads and writes a bundle's annotations.
pub struct AnnotationStore {
    storage: AtomicFsStorage,
}

impl AnnotationStore {
    /// Wraps storage.
    #[must_use]
    pub fn new(storage: AtomicFsStorage) -> Self {
        Self { storage }
    }

    /// The storage this writes through.
    #[must_use]
    pub fn storage(&self) -> &AtomicFsStorage {
        &self.storage
    }

    /// Loads the annotations of the bundle at `bundle`.
    ///
    /// Returns an empty set if the bundle has no annotations file, which is the normal
    /// state of a freshly imported lecture.
    ///
    /// # Errors
    ///
    /// See [`versioned::load`]. A file that exists but cannot be read is an error, and a
    /// corrupt one is copied aside first — only genuine absence is treated as empty, so
    /// a permissions problem or an unreadable disk can never be mistaken for "this
    /// lecture has no highlights" and then overwritten by the next save.
    pub fn load(&self, bundle: &RelativePath) -> Result<AnnotationSet, CoreError> {
        let path = annotations_path(bundle)?;

        match versioned::load(
            &self.storage,
            &path,
            ANNOTATIONS_FILE_NAME,
            ANNOTATIONS_SCHEMA,
        ) {
            Ok(set) => Ok(set),
            Err(error) if versioned::is_missing(&error) => Ok(AnnotationSet::empty()),
            Err(error) => Err(error),
        }
    }

    /// Saves `annotations` into the bundle at `bundle`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the write fails, leaving the previous file exactly
    /// as it was, and a containment error if `bundle` does not resolve safely inside the
    /// vault.
    pub fn save(
        &self,
        bundle: &RelativePath,
        annotations: &AnnotationSet,
    ) -> Result<(), CoreError> {
        let path = annotations_path(bundle)?;
        versioned::save(&self.storage, &path, annotations)
    }
}

/// `<bundle>/annotations.json`.
fn annotations_path(bundle: &RelativePath) -> Result<RelativePath, CoreError> {
    bundle.child(Slug::parse(ANNOTATIONS_FILE_NAME)?)
}
