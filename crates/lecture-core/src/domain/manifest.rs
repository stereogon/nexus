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

use crate::domain::{Facets, Label, LectureNumber, OrderKey, SchemaRange, Source, Timestamp};
use crate::error::CoreError;

/// The schema version this build reads and writes.
///
/// Treated as a contract with files already on someone's disk, and with an iPad that may
/// hold an older copy. Because unknown fields are refused, **adding any field requires
/// bumping this**, which is deliberate: the alternative is an older reader silently
/// dropping a newer device's data on the next save.
///
/// Version 3 (2026-11-05) added the lecture's `number`, optional; see `lecture_number`.
/// Version 4 (2026-11-06) made `source` optional: a bundle without one is a plain note,
/// made in Nexus rather than imported, with nothing beside its `notes.md` to render.
pub const CURRENT_SCHEMA_VERSION: u32 = 4;

/// The first version whose bundles may have no source: plain notes.
const FIRST_VERSION_WITH_NOTES: u32 = 4;

/// The oldest manifest version this build can still read.
///
/// Version 1 did not record source fingerprints, versions 1 and 2 had no lecture number,
/// and versions 1 to 3 always had a source. Nothing else about the format changed, so an older manifest is read with those
/// absent — which is exactly what it meant — and rewritten as the current version by the
/// next save. Reading never writes.
///
/// Refusing it instead would have been wrong in a way that is easy to miss: the file is
/// not damaged, and the person holding it cannot do anything about the refusal.
pub const OLDEST_READABLE_SCHEMA_VERSION: u32 = 1;

/// The manifest versions this build reads, and the one it writes.
pub const MANIFEST_SCHEMA: SchemaRange =
    SchemaRange::new(OLDEST_READABLE_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);

/// The file name a manifest is stored under, and the marker that a directory *is* a
/// lecture bundle. The vault walk prunes at the first one it finds.
pub const MANIFEST_FILE_NAME: &str = "manifest.json";

/// A lecture bundle's metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "RawManifest", into = "RawManifest")]
pub struct Manifest {
    title: Label,
    number: Option<LectureNumber>,
    sequence: OrderKey,
    facets: Facets,
    source: Option<Source>,
    created_at: Timestamp,
    updated_at: Timestamp,
}

/// The on-disk shape, before cross-field checks.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RawManifest {
    schema_version: u32,
    title: Label,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    number: Option<LectureNumber>,
    sequence: OrderKey,
    #[serde(default)]
    facets: Facets,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source: Option<Source>,
    created_at: Timestamp,
    updated_at: Timestamp,
}

impl TryFrom<RawManifest> for Manifest {
    type Error = CoreError;

    fn try_from(raw: RawManifest) -> Result<Self, Self::Error> {
        if !MANIFEST_SCHEMA.accepts(raw.schema_version) {
            return Err(MANIFEST_SCHEMA.reject(MANIFEST_FILE_NAME, raw.schema_version));
        }

        raw.facets.validate()?;

        // Before version 4 every bundle was an imported document. One with no source is a
        // damaged file, and reading it as an empty note would hide the document it lost.
        if raw.source.is_none() && raw.schema_version < FIRST_VERSION_WITH_NOTES {
            return Err(CoreError::InvalidManifest {
                reason: "it names no document, which every lecture saved before version 4 had",
            });
        }

        if raw.created_at > raw.updated_at {
            return Err(CoreError::InvalidManifest {
                reason: "it claims to have been changed before it was created",
            });
        }

        Ok(Self {
            title: raw.title,
            number: raw.number,
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
            number: manifest.number,
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
            source: Some(source),
            ..Self::note(title, sequence, at)
        }
    }

    /// A manifest for a plain note: made in Nexus, with no document beside it.
    ///
    /// Still a bundle with a manifest rather than a bare `.md` file, so everything a lecture
    /// has that is not its document -- order, number, tags, `assets/` for pasted images, a
    /// remembered place -- works for a note without a second set of rules.
    #[must_use]
    pub fn note(title: Label, sequence: OrderKey, at: Timestamp) -> Self {
        Self {
            title,
            number: None,
            sequence,
            facets: Facets::empty(),
            source: None,
            created_at: at.clone(),
            updated_at: at,
        }
    }

    /// Replaces the lecture's name.
    ///
    /// The folder is deliberately **not** renamed. §3 makes the folder layout a derived
    /// projection of `sequence` and the facets, so a title and a directory name are allowed
    /// to disagree until a reorganize re-derives the projection. Renaming the folder here
    /// would move a lecture as a side effect of correcting a typo.
    #[must_use]
    pub fn with_title(mut self, title: Label) -> Self {
        self.title = title;
        self
    }

    /// Gives the lecture a number, or takes it away. Does not move it: placing a numbered
    /// lecture is `placed_by_number`'s job, done by whoever changes the number.
    #[must_use]
    pub fn with_number(mut self, number: Option<LectureNumber>) -> Self {
        self.number = number;
        self
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

    /// Replaces the source record.
    ///
    /// Used as an import walks a conversion forward: the title, the facets and the order
    /// key do not change, only what has happened to the document. The modification time is
    /// deliberately **not** touched here — `ManifestStore::save` owns that, so saving
    /// cannot forget to.
    #[must_use]
    pub fn with_source(mut self, source: Source) -> Self {
        self.source = Some(source);
        self
    }

    /// The lecture's display title.
    #[must_use]
    pub fn title(&self) -> &Label {
        &self.title
    }

    /// The lecture's number, if it has one.
    #[must_use]
    pub fn number(&self) -> Option<&LectureNumber> {
        self.number.as_ref()
    }

    /// The authoritative position among siblings.
    ///
    /// Folder-name prefixes such as `01-` are a *projection* of this, kept for Finder
    /// legibility. Where the two disagree, this wins. A lecture number does not replace it;
    /// setting one moves this (`placed_by_number`).
    #[must_use]
    pub fn sequence(&self) -> &OrderKey {
        &self.sequence
    }

    /// The taxonomy this lecture is grouped by.
    #[must_use]
    pub fn facets(&self) -> &Facets {
        &self.facets
    }

    /// Where the document came from, or `None` for a plain note, which has none.
    #[must_use]
    pub fn source(&self) -> Option<&Source> {
        self.source.as_ref()
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
