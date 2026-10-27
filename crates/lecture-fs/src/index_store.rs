//! Reading and writing `.nexus/index.json`.
//!
//! Every failure here collapses to the same answer: an empty index, which costs one slow
//! startup. Missing, corrupt, from a newer build, unreadable — none of them are worth
//! distinguishing, because the cache is never the authority on what is in the vault.
//! That is why [`VaultIndexStore::load`] cannot fail rather than merely usually not
//! failing.
//!
//! The contrast with [`ManifestStore`](crate::ManifestStore) is deliberate and is about
//! *what the file holds*, not what kind of file it is. A damaged manifest is copied aside
//! because it holds work that exists nowhere else. A damaged cache is discarded, because
//! preserving derived bytes would leave `.bak` litter in a folder someone studies in.

use lecture_core::{
    CoreError, INDEX_FILE_NAME, LectureBundle, RelativePath, Slug, VaultIndex, cache_dir_segment,
};

use crate::storage::AtomicFsStorage;
use crate::versioned;

/// Reads and writes the cached vault listing.
pub struct VaultIndexStore {
    storage: AtomicFsStorage,
}

impl VaultIndexStore {
    /// Caches inside `storage`'s vault.
    #[must_use]
    pub fn new(storage: AtomicFsStorage) -> Self {
        Self { storage }
    }

    /// Reads the cached listing, or returns an empty one.
    ///
    /// Infallible on purpose. There is no failure a caller could usefully handle: the
    /// answer to every one of them is to scan the vault, which the caller was going to
    /// do regardless. Returning `Result` here would invite someone to treat a missing
    /// cache as a problem and refuse to start.
    /// Deliberately **not** routed through [`versioned`](crate::versioned). That module
    /// exists to share one behaviour — copy the damaged bytes aside, then carry on — and
    /// that behaviour is wrong here. It would leave `index.json.bak` in a folder someone
    /// is trying to study in, preserving bytes that hold nothing the vault does not
    /// already hold.
    #[must_use]
    pub fn load(&self) -> VaultIndex {
        let Ok(path) = index_path() else {
            return VaultIndex::empty();
        };

        let Ok(bytes) = self.storage.read(&path) else {
            return VaultIndex::empty();
        };

        // Every failure is the same answer, including a version this build does not
        // know: discard it and let the scan say what is really there.
        serde_json::from_slice(&bytes).unwrap_or_else(|_| VaultIndex::empty())
    }

    /// Writes the listing for `bundles`, creating `.nexus/` if needed.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the cache directory cannot be created or the write
    /// fails. A failed write leaves the previous cache as it was, and a caller that
    /// ignores the error loses only the fast first paint — so this returns `Result`
    /// rather than swallowing it, while being safe to ignore deliberately.
    pub fn save(&self, bundles: &[LectureBundle]) -> Result<(), CoreError> {
        let directory = RelativePath::from_segments(vec![cache_dir_segment()?])?;
        self.storage.create_dir(&directory)?;

        versioned::save(&self.storage, &index_path()?, &VaultIndex::of(bundles))
    }

    /// Whether a cache file is present.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the vault cannot be inspected.
    pub fn exists(&self) -> Result<bool, CoreError> {
        self.storage.exists(&index_path()?)
    }
}

/// `.nexus/index.json`.
fn index_path() -> Result<RelativePath, CoreError> {
    RelativePath::from_segments(vec![cache_dir_segment()?, Slug::internal(INDEX_FILE_NAME)?])
}
