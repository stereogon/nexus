//! `.nexus/index.json` — a cache that is never trusted.
//!
//! # The decision that makes this simple
//!
//! The cache is **not** consulted to decide what is in the vault. It exists so the
//! sidebar can paint instantly at startup; the vault walk runs straight afterwards and
//! replaces whatever it shows. The scan is always the authority.
//!
//! That removes the hardest problem a cache usually has. There is no staleness scheme,
//! no fingerprint of the vault, no mtime comparison — nothing to get subtly wrong and
//! nothing to be subtly wrong *about*. A stale cache is corrected within the same
//! startup, and a person reorganising their vault in Finder with the app closed cannot
//! produce a wrong answer, only a briefly out-of-date first paint.
//!
//! It is also what makes `CLAUDE.md` §3's requirement literally true: deleting `.nexus/`
//! costs one slow startup and nothing else, because every field here is derived from a
//! `manifest.json` that remains the source of truth.
//!
//! # A corrupt cache is discarded, not backed up
//!
//! The opposite of the rule for `manifest.json` and `annotations.json`, and for the same
//! underlying reason. Those are backed up because they hold work that exists nowhere
//! else. This holds nothing that is not already in the vault, so preserving damaged
//! bytes would be clutter in a folder someone is trying to study in. The distinction is
//! *does this contain work* — not *is this a file*.

use serde::{Deserialize, Serialize};

use crate::domain::{BundleRef, LectureBundle, SchemaRange, Slug};
use crate::error::CoreError;

/// The directory Nexus keeps derived data in, inside the vault.
///
/// Hidden on purpose: it is not the user's to manage, and a visible folder of derived
/// data in the middle of someone's study material is clutter they would reasonably try
/// to delete. Deleting it is in fact safe — see the module documentation — but it should
/// not be inviting.
pub const CACHE_DIR_NAME: &str = ".nexus";

/// The cached vault listing, inside [`CACHE_DIR_NAME`].
pub const INDEX_FILE_NAME: &str = "index.json";

/// The schema version of the cache file.
///
/// Carried for the same reason as the other files, but with a benign failure path: a
/// version this build does not know is simply discarded and rebuilt, so a mismatch
/// costs one slow startup rather than needing a migration.
pub const INDEX_SCHEMA_VERSION: u32 = 1;

/// The index versions this build reads, and the one it writes.
///
/// Exactly one, and deliberately never more. `.nexus/index.json` is derived data: an
/// unrecognised version is discarded and rebuilt from a vault scan, so there is nothing
/// a migration could usefully preserve.
pub const INDEX_SCHEMA: SchemaRange = SchemaRange::exact(INDEX_SCHEMA_VERSION);

/// A cached listing of every lecture in the vault.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "RawVaultIndex", into = "RawVaultIndex")]
pub struct VaultIndex {
    entries: Vec<BundleRef>,
}

/// The on-disk shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RawVaultIndex {
    schema_version: u32,
    #[serde(default)]
    entries: Vec<BundleRef>,
}

impl TryFrom<RawVaultIndex> for VaultIndex {
    type Error = CoreError;

    fn try_from(raw: RawVaultIndex) -> Result<Self, Self::Error> {
        if raw.schema_version != INDEX_SCHEMA_VERSION {
            return Err(INDEX_SCHEMA.reject(INDEX_FILE_NAME, raw.schema_version));
        }

        let mut index = Self {
            entries: raw.entries,
        };
        index.sort();

        Ok(index)
    }
}

impl From<VaultIndex> for RawVaultIndex {
    fn from(index: VaultIndex) -> Self {
        Self {
            schema_version: INDEX_SCHEMA_VERSION,
            entries: index.entries,
        }
    }
}

impl VaultIndex {
    /// An empty index, which is what a missing or unusable cache produces.
    #[must_use]
    pub fn empty() -> Self {
        Self::default()
    }

    /// The index describing `bundles`, as a scan found them.
    #[must_use]
    pub fn of(bundles: &[LectureBundle]) -> Self {
        let mut index = Self {
            entries: bundles.iter().map(LectureBundle::reference).collect(),
        };
        index.sort();
        index
    }

    /// Every cached lecture, in path order.
    #[must_use]
    pub fn entries(&self) -> &[BundleRef] {
        &self.entries
    }

    /// How many lectures are cached.
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether nothing is cached.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Orders entries by path.
    ///
    /// Deterministic bytes, so rewriting an unchanged index does not look like a change
    /// — which matters because this file sits inside the vault, and a vault may one day
    /// be inside a sync client.
    fn sort(&mut self) {
        self.entries
            .sort_by(|a, b| a.directory().cmp(b.directory()));
    }
}

/// `.nexus` as a path segment.
///
/// # Errors
///
/// Returns [`CoreError::InvalidName`] only if the constant above were edited into
/// something unusable, which a test asserts it is not.
pub fn cache_dir_segment() -> Result<Slug, CoreError> {
    Slug::internal(CACHE_DIR_NAME)
}
