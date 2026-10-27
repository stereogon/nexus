//! `manifest.json`: everything a bundle knows about itself.
//!
//! One manifest per lecture, and no central index anywhere. That is the decision in
//! `CLAUDE.md` §3 and it is about sync: a top-level file listing every lecture would be
//! rewritten by every change to any lecture, so two devices editing two different
//! lectures would collide over it constantly. Per-bundle manifests confine each edit to
//! one file, and `.nexus/` holds only a cache that can be thrown away and rebuilt.
//!
//! What a manifest holds is deliberately narrow: identity, order, taxonomy, and where
//! the document came from. What it does **not** hold is view state — the page someone
//! was last on, their scroll offset, their zoom. Those change constantly, and in a
//! synced file they would generate churn on every device and conflicts for nothing. See
//! the dated amendment in `claude-spec.md`.

use serde::{Deserialize, Serialize};

use crate::domain::{Facets, Label, OrderKey, Source, Timestamp};
use crate::error::CoreError;

/// The schema version this build reads and writes.
///
/// Treated as a contract with files already on someone's disk, and with an iPad that may
/// hold an older copy. Because unknown fields are refused, **adding any field requires
/// bumping this**, which is deliberate: the alternative is an older reader silently
/// dropping a newer device's data on the next save.
pub const CURRENT_SCHEMA_VERSION: u32 = 1;

/// The file name a manifest is stored under, and the marker that a directory *is* a
/// lecture bundle. The vault walk prunes at the first one it finds.
pub const MANIFEST_FILE_NAME: &str = "manifest.json";

/// A lecture bundle's metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "RawManifest", into = "RawManifest")]
pub struct Manifest {
    title: Label,
    sequence: OrderKey,
    facets: Facets,
    source: Source,
    created_at: Timestamp,
    updated_at: Timestamp,
}

/// The on-disk shape, before cross-field checks.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RawManifest {
    schema_version: u32,
    title: Label,
    sequence: OrderKey,
    #[serde(default)]
    facets: Facets,
    source: Source,
    created_at: Timestamp,
    updated_at: Timestamp,
}

impl TryFrom<RawManifest> for Manifest {
    type Error = CoreError;

    fn try_from(raw: RawManifest) -> Result<Self, Self::Error> {
        if raw.schema_version != CURRENT_SCHEMA_VERSION {
            return Err(CoreError::SchemaVersionUnsupported {
                file: MANIFEST_FILE_NAME,
                found: raw.schema_version,
                supported: CURRENT_SCHEMA_VERSION,
            });
        }

        raw.facets.validate()?;

        if raw.created_at > raw.updated_at {
            return Err(CoreError::InvalidManifest {
                reason: "it claims to have been changed before it was created",
            });
        }

        Ok(Self {
            title: raw.title,
            sequence: raw.sequence,
            // Tag order is corrected rather than refused: losing access to a lecture
            // because its tags were listed alphabetically wrong would be a bad trade.
            facets: raw.facets.canonicalised(),
            source: raw.source,
            created_at: raw.created_at,
            updated_at: raw.updated_at,
        })
    }
}

impl From<Manifest> for RawManifest {
    fn from(manifest: Manifest) -> Self {
        Self {
            // Always the current version, never whatever was read. A manifest in memory
            // is current by construction, so saving cannot write a stale version.
            schema_version: CURRENT_SCHEMA_VERSION,
            title: manifest.title,
            sequence: manifest.sequence,
            facets: manifest.facets,
            source: manifest.source,
            created_at: manifest.created_at,
            updated_at: manifest.updated_at,
        }
    }
}

impl Manifest {
    /// A manifest for a newly imported lecture.
    #[must_use]
    pub fn new(title: Label, sequence: OrderKey, source: Source, at: Timestamp) -> Self {
        Self {
            title,
            sequence,
            facets: Facets::empty(),
            source,
            created_at: at.clone(),
            updated_at: at,
        }
    }

    /// Replaces the taxonomy.
    #[must_use]
    pub fn with_facets(mut self, facets: Facets) -> Self {
        self.facets = facets.canonicalised();
        self
    }

    /// Returns a copy marked as changed at `at`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidManifest`] if `at` precedes the creation time, which
    /// would mean a clock that moved backwards. Refusing keeps the ordering invariant
    /// true for every manifest that exists rather than only for ones written in order.
    pub fn touched(&self, at: Timestamp) -> Result<Self, CoreError> {
        if at < self.created_at {
            return Err(CoreError::InvalidManifest {
                reason: "the clock reads earlier than when this lecture was created",
            });
        }

        let mut updated = self.clone();
        updated.updated_at = at;
        Ok(updated)
    }

    /// Moves this lecture to a new position among its siblings.
    #[must_use]
    pub fn resequenced(mut self, sequence: OrderKey) -> Self {
        self.sequence = sequence;
        self
    }

    /// The lecture's display title.
    #[must_use]
    pub fn title(&self) -> &Label {
        &self.title
    }

    /// The authoritative position among siblings.
    ///
    /// Folder-name prefixes such as `01-` are a *projection* of this, kept for Finder
    /// legibility. Where the two disagree, this wins.
    #[must_use]
    pub fn sequence(&self) -> &OrderKey {
        &self.sequence
    }

    /// The taxonomy this lecture is grouped by.
    #[must_use]
    pub fn facets(&self) -> &Facets {
        &self.facets
    }

    /// Where the document came from.
    #[must_use]
    pub fn source(&self) -> &Source {
        &self.source
    }

    /// When the bundle was created.
    #[must_use]
    pub fn created_at(&self) -> &Timestamp {
        &self.created_at
    }

    /// When the bundle was last changed.
    #[must_use]
    pub fn updated_at(&self) -> &Timestamp {
        &self.updated_at
    }
}
