//! The whole contents of one bundle's `annotations.json`.
//!
//! # Two fields from the spec that are deliberately absent
//!
//! **`documentId`.** The spec's example carries `"documentId": "doc-uuid-1234"`, but
//! nothing anywhere else in the format holds a document id, so there is nothing to
//! compare it against — a value that cannot be checked is a value that will eventually
//! be wrong without anyone noticing.
//!
//! The need behind it is real, though, and worth naming: annotations are positioned
//! against a *particular rendering* of a document, so if the PDF is reconverted and the
//! layout shifts, every rectangle silently points at the wrong place. A random id cannot
//! detect that; a hash of the document can. That is what the deferred `source` hash in
//! `manifest.json` is for, and pairing the two is Milestone 2's job. Inventing an
//! unverifiable id now would make it *look* solved.
//!
//! **`inkStrokes`.** The spec declares `"inkStrokes": []` and then never mentions ink
//! anywhere — no feature, no shortcut, no test. An always-empty array is a field that
//! reads as working while nothing writes it. Omitted until Apple Pencil support is an
//! actual requirement, which is a Phase 2 iPad question.
//!
//! Both omissions cost a `schemaVersion` bump when they arrive, since unknown fields are
//! refused. That is the intended trade: a planned migration beats a field nothing fills.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::domain::{Annotation, AnnotationId, PageNumber};
use crate::error::CoreError;

/// The schema version this build reads and writes for `annotations.json`.
///
/// Tracked separately from the manifest's version on purpose: the two files change for
/// different reasons, and coupling them would force a migration of one whenever the
/// other grew a field.
pub const ANNOTATIONS_SCHEMA_VERSION: u32 = 1;

/// The file name annotations are stored under.
pub const ANNOTATIONS_FILE_NAME: &str = "annotations.json";

/// Every annotation in one bundle.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "RawAnnotationSet", into = "RawAnnotationSet")]
pub struct AnnotationSet {
    annotations: Vec<Annotation>,
}

/// The on-disk shape, before cross-record checks.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RawAnnotationSet {
    schema_version: u32,
    #[serde(default)]
    annotations: Vec<Annotation>,
}

impl TryFrom<RawAnnotationSet> for AnnotationSet {
    type Error = CoreError;

    fn try_from(raw: RawAnnotationSet) -> Result<Self, Self::Error> {
        if raw.schema_version != ANNOTATIONS_SCHEMA_VERSION {
            return Err(CoreError::ManifestVersionUnsupported {
                found: raw.schema_version,
                supported: ANNOTATIONS_SCHEMA_VERSION,
            });
        }

        let mut set = Self {
            annotations: raw.annotations,
        };
        set.validate()?;
        set.sort();

        Ok(set)
    }
}

impl From<AnnotationSet> for RawAnnotationSet {
    fn from(set: AnnotationSet) -> Self {
        Self {
            schema_version: ANNOTATIONS_SCHEMA_VERSION,
            annotations: set.annotations,
        }
    }
}

impl AnnotationSet {
    /// An empty set, as a freshly imported bundle has.
    #[must_use]
    pub fn empty() -> Self {
        Self::default()
    }

    /// Adds an annotation.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::DuplicateAnnotationId`] if the id is already present.
    /// Allowing two would mean a `cite://<id>` link in the notes that resolves to two
    /// different places, and nothing to say which was meant.
    pub fn insert(&mut self, annotation: Annotation) -> Result<(), CoreError> {
        annotation.validate()?;

        if self.get(annotation.id()).is_some() {
            return Err(CoreError::DuplicateAnnotationId {
                id: annotation.id().as_str().to_owned(),
            });
        }

        self.annotations.push(annotation);
        self.sort();
        Ok(())
    }

    /// Removes an annotation, returning it.
    ///
    /// Returns `None` if no annotation has that id, rather than erroring: deleting
    /// something already gone is the outcome the caller wanted.
    pub fn remove(&mut self, id: &AnnotationId) -> Option<Annotation> {
        let position = self.annotations.iter().position(|a| a.id() == id)?;

        // `Vec::remove` rather than `swap_remove`: order is re-established below anyway,
        // but keeping it stable means a removal does not reshuffle the file.
        Some(self.annotations.remove(position))
    }

    /// The annotation with this id.
    #[must_use]
    pub fn get(&self, id: &AnnotationId) -> Option<&Annotation> {
        self.annotations.iter().find(|a| a.id() == id)
    }

    /// Every annotation, in stored order.
    #[must_use]
    pub fn all(&self) -> &[Annotation] {
        &self.annotations
    }

    /// The annotations on one page.
    pub fn on_page(&self, page: PageNumber) -> impl Iterator<Item = &Annotation> {
        self.annotations.iter().filter(move |a| a.page() == page)
    }

    /// How many annotations there are.
    #[must_use]
    pub fn len(&self) -> usize {
        self.annotations.len()
    }

    /// Whether there are no annotations.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.annotations.is_empty()
    }

    /// Checks every annotation and that no id repeats.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::DuplicateAnnotationId`] for a repeated id, or whatever
    /// [`Annotation::validate`] objects to.
    pub fn validate(&self) -> Result<(), CoreError> {
        let mut seen = BTreeSet::new();

        for annotation in &self.annotations {
            annotation.validate()?;

            if !seen.insert(annotation.id()) {
                return Err(CoreError::DuplicateAnnotationId {
                    id: annotation.id().as_str().to_owned(),
                });
            }
        }

        Ok(())
    }

    /// Orders annotations by page, then by id.
    ///
    /// Deterministic order means the same set of annotations always serialises to the
    /// same bytes, so a save that changed nothing does not look like a change to a sync
    /// client. Id is the tiebreaker rather than creation time because it is guaranteed
    /// unique, which makes the sort total.
    fn sort(&mut self) {
        self.annotations
            .sort_by(|a, b| a.page().cmp(&b.page()).then_with(|| a.id().cmp(b.id())));
    }
}
