//! A lecture bundle: a directory holding one lecture and everything about it.
//!
//! # Everything inside is relative, and that is load-bearing
//!
//! A bundle's files are addressed relative to the bundle directory, never to the vault
//! root and never absolutely. So moving a lecture — dragging it into another course,
//! renaming the folder above it, or having a sync client place the vault at a different
//! path on another device — rewrites nothing inside it. The manifest says
//! `source/document.pdf`, and that stays true wherever the bundle sits.
//!
//! This is a locked decision in `CLAUDE.md` §3 and it has a test: relocating a bundle
//! must move every derived path with it and leave the stored manifest untouched.
//!
//! # A lecture is a directory containing `manifest.json`
//!
//! Not a registry entry, not a row in an index. That is what makes the vault walk able
//! to prune at the first manifest it finds, and what makes a bundle survive being moved
//! by Finder while the app is closed.

use crate::domain::{ANNOTATIONS_FILE_NAME, MANIFEST_FILE_NAME};
use serde::{Deserialize, Serialize};

use crate::domain::{Facets, Label, Manifest, OrderKey, RelativePath, Slug};
use crate::error::CoreError;

/// The notes file every bundle has.
pub const NOTES_FILE_NAME: &str = "notes.md";

/// Where the rendered PDF and the original import live.
pub const SOURCE_DIR_NAME: &str = "source";

/// Where pasted images and figures live.
pub const ASSETS_DIR_NAME: &str = "assets";

/// One lecture: where it is, and what its manifest says.
///
/// Holds no file contents. Notes and annotations are large and change independently, so
/// they are loaded through their own stores when wanted rather than carried around
/// inside every reference to a lecture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LectureBundle {
    directory: RelativePath,
    manifest: Manifest,
}

impl LectureBundle {
    /// A bundle at `directory`, described by `manifest`.
    #[must_use]
    pub fn new(directory: RelativePath, manifest: Manifest) -> Self {
        Self {
            directory,
            manifest,
        }
    }

    /// The bundle's directory, relative to the vault root.
    #[must_use]
    pub fn directory(&self) -> &RelativePath {
        &self.directory
    }

    /// What the bundle's manifest says.
    #[must_use]
    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }

    /// `<bundle>/manifest.json`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::RelativePathTooDeep`] if the bundle sits deeper than the
    /// vault allows, and [`CoreError::InvalidName`] never in practice, since the file
    /// names are constants.
    pub fn manifest_path(&self) -> Result<RelativePath, CoreError> {
        self.child(MANIFEST_FILE_NAME)
    }

    /// `<bundle>/notes.md`.
    ///
    /// # Errors
    ///
    /// As [`Self::manifest_path`].
    pub fn notes_path(&self) -> Result<RelativePath, CoreError> {
        self.child(NOTES_FILE_NAME)
    }

    /// `<bundle>/annotations.json`.
    ///
    /// # Errors
    ///
    /// As [`Self::manifest_path`].
    pub fn annotations_path(&self) -> Result<RelativePath, CoreError> {
        self.child(ANNOTATIONS_FILE_NAME)
    }

    /// The PDF the viewer renders.
    ///
    /// Taken from the manifest rather than assumed, because the file name inside
    /// `source/` is recorded there and a reconversion may change it.
    ///
    /// # Errors
    ///
    /// As [`Self::manifest_path`].
    pub fn document_path(&self) -> Result<RelativePath, CoreError> {
        self.directory.join(self.manifest.source().document())
    }

    /// The file as imported, if one was kept.
    ///
    /// `None` only when the document needed no conversion, in which case the PDF *is*
    /// the original.
    ///
    /// # Errors
    ///
    /// As [`Self::manifest_path`].
    pub fn original_path(&self) -> Result<Option<RelativePath>, CoreError> {
        self.manifest
            .source()
            .original()
            .map(|original| self.directory.join(original))
            .transpose()
    }

    /// The same lecture, moved to `directory`.
    ///
    /// The manifest is carried over **unchanged**. Nothing inside a bundle records where
    /// the bundle is, so there is nothing to rewrite — which is the property this type
    /// exists to keep true.
    #[must_use]
    pub fn relocated(&self, directory: RelativePath) -> Self {
        Self {
            directory,
            manifest: self.manifest.clone(),
        }
    }

    /// The projection the sidebar groups and orders on.
    #[must_use]
    pub fn reference(&self) -> BundleRef {
        BundleRef {
            directory: self.directory.clone(),
            title: self.manifest.title().clone(),
            sequence: self.manifest.sequence().clone(),
            facets: self.manifest.facets().clone(),
        }
    }

    /// Joins a constant file name onto the bundle directory.
    fn child(&self, name: &str) -> Result<RelativePath, CoreError> {
        self.directory.child(Slug::parse(name)?)
    }
}

/// What the sidebar needs to list a lecture without opening it.
///
/// A deliberately small projection of a manifest: enough to group by facet, order by
/// `sequence`, and show a title. Keeping it separate means listing a vault of several
/// hundred lectures does not carry their conversion provenance and timestamps around.
///
/// This is also exactly what `.nexus/` caches. The cache is rebuildable precisely
/// because every field here is derived from a `manifest.json` that remains the source of
/// truth.
///
/// Serialisable because this is exactly what `.nexus/index.json` stores. Every field is
/// derived from a `manifest.json`, which is what makes that cache rebuildable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct BundleRef {
    directory: RelativePath,
    title: Label,
    sequence: OrderKey,
    facets: Facets,
}

impl BundleRef {
    /// Where the lecture lives, relative to the vault root.
    #[must_use]
    pub fn directory(&self) -> &RelativePath {
        &self.directory
    }

    /// The lecture's title.
    #[must_use]
    pub fn title(&self) -> &Label {
        &self.title
    }

    /// The authoritative order key.
    ///
    /// A `01-` prefix on the folder name is a *projection* of this for Finder's benefit.
    /// Where the two disagree, this wins.
    #[must_use]
    pub fn sequence(&self) -> &OrderKey {
        &self.sequence
    }

    /// The facets the sidebar groups on.
    #[must_use]
    pub fn facets(&self) -> &Facets {
        &self.facets
    }
}
