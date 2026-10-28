//! What an import puts in a bundle's `source/`, decided before anything touches the disk.
//!
//! Importing a document is a handful of decisions and one long I/O operation. The
//! decisions are here, where they can be tested without a filesystem or a converter: what
//! the file is called once it is in the vault, whether a conversion is owed, and what the
//! manifest should therefore say.
//!
//! # A PDF is stored once, not twice
//!
//! `CLAUDE.md` §3 says the original is always kept so reconversion stays possible. For a
//! PDF there is nothing to reconvert — it *is* the render format — so the imported file
//! becomes `source/document.pdf` and there is no separate original. Keeping a byte-for-byte
//! copy under a second name would double the disk cost of every PDF lecture, and lecture
//! PDFs run to hundreds of megabytes.
//!
//! [`Source`] already requires this rather than merely permitting it: a conversion of
//! `NotRequired` with an original beside it is refused as an inconsistent manifest. So the
//! rule is enforced in one place and this module simply satisfies it.
//!
//! # The imported bytes are fingerprinted once
//!
//! Exactly **one** file exists when an import finishes copying, and which field its
//! fingerprint belongs in depends on the format: for a PDF it is the document, and for
//! anything else it is the original, because the document has not been made yet. That is
//! why [`ImportPlan::source`] takes a single fingerprint and decides for itself, rather
//! than asking a caller to know the rule.
//!
//! # Two kinds of path, and why both are needed
//!
//! `CLAUDE.md` §3: *"Everything inside a bundle is referenced relatively, so moving a
//! bundle directory requires no link rewriting."* So what the **manifest records** is
//! bundle-relative — `source/document.pdf` — and nothing inside a bundle may name the
//! bundle. But the storage adapter writes against the **vault root**, so copying the file
//! and running a converter need `cs454/raft/source/document.pdf`.
//!
//! Both live here, and the names say which is which: [`ImportPlan::document`] and
//! [`ImportPlan::original`] are what goes in the manifest, while
//! [`ImportPlan::destination`] and [`ImportPlan::document_in_vault`] are where the bytes
//! are. Getting this wrong is not cosmetic — a manifest holding a vault-relative path
//! resolves, via `LectureBundle::document_path`, to
//! `cs454/raft/cs454/raft/source/document.pdf`, so the lecture cannot be opened and moving
//! the bundle cannot fix it. It was wrong in exactly that way until 2026-10-28.

use crate::domain::{
    Conversion, ConversionRequest, DocumentFormat, Fingerprint, RelativePath, SOURCE_DIR_NAME,
    Slug, Source,
};
use crate::error::CoreError;

/// The name every bundle's rendered PDF has.
pub const DOCUMENT_FILE_NAME: &str = "document.pdf";

/// The stem an imported non-PDF keeps, beside the PDF made from it.
pub const ORIGINAL_FILE_STEM: &str = "original";

/// Where an import writes, and what the manifest will say about it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportPlan {
    format: DocumentFormat,
    /// Where the bundle is, relative to the vault root. Held so the plan can offer paths in
    /// both frames; it is never written into the manifest.
    bundle: RelativePath,
    /// Bundle-relative, as the manifest records it.
    document: RelativePath,
    /// Bundle-relative, as the manifest records it.
    original: Option<RelativePath>,
    conversion: Conversion,
}

impl ImportPlan {
    /// Plans the import of a `format` document into `bundle`.
    ///
    /// The stored name is canonical — `original.pptx`, never the name the file happened to
    /// arrive with. Two reasons: a bundle is then self-describing whatever a person called
    /// the download, and the name is one fewer thing that has to survive being a `Slug`.
    /// The name someone knows the lecture by belongs in the manifest's title, where it can
    /// contain spaces and punctuation and be changed without touching a file.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::RelativePathTooDeep`] if `bundle` sits so deep that `source/`
    /// would pass the depth cap, or [`CoreError::InvalidName`] if the derived names are not
    /// usable — neither of which can happen for a bundle the vault walk found.
    pub fn new(bundle: &RelativePath, format: DocumentFormat) -> Result<Self, CoreError> {
        // Built inside the bundle, not from it: these are what the manifest records, and a
        // manifest that names its own bundle breaks relocation.
        let source = RelativePath::root_level(Slug::internal(SOURCE_DIR_NAME)?);
        let document = source.child(Slug::internal(DOCUMENT_FILE_NAME)?)?;

        // Checked here rather than only when a path is composed, so a bundle too deep to
        // hold a `source/` is refused by the plan instead of part-way through the import.
        bundle.join(&document)?;

        if !format.needs_conversion() {
            return Ok(Self {
                format,
                bundle: bundle.clone(),
                document,
                original: None,
                conversion: Conversion::not_required(),
            });
        }

        let name = format!("{ORIGINAL_FILE_STEM}.{}", format.extension());
        let original = source.child(Slug::internal(&name)?)?;

        Ok(Self {
            format,
            bundle: bundle.clone(),
            document,
            original: Some(original),
            conversion: Conversion::queued(),
        })
    }

    /// The format being imported.
    #[must_use]
    pub const fn format(&self) -> DocumentFormat {
        self.format
    }

    /// Where the imported bytes are written, **relative to the vault root**.
    ///
    /// The document itself for a PDF, and the original for anything that needs converting.
    ///
    /// # Errors
    ///
    /// As [`Self::document_in_vault`].
    pub fn destination(&self) -> Result<RelativePath, CoreError> {
        self.bundle
            .join(self.original.as_ref().unwrap_or(&self.document))
    }

    /// The rendered PDF's place **relative to the vault root**, for the adapter to read.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::RelativePathTooDeep`] if the composed path passes the depth
    /// cap, which [`ImportPlan::new`] has already rejected.
    pub fn document_in_vault(&self) -> Result<RelativePath, CoreError> {
        self.bundle.join(&self.document)
    }

    /// The PDF the viewer will open, **relative to the bundle**, as the manifest records it.
    ///
    /// A **promise** rather than a fact until the conversion finishes: for anything but a
    /// PDF import, no file exists here yet. [`Source::document_is_ready`] is the question
    /// to ask before opening it.
    #[must_use]
    pub const fn document(&self) -> &RelativePath {
        &self.document
    }

    /// The imported file kept for reconversion, **relative to the bundle**, or `None` for a
    /// PDF.
    #[must_use]
    pub const fn original(&self) -> Option<&RelativePath> {
        self.original.as_ref()
    }

    /// Whether a converter has to run before this lecture can be opened.
    #[must_use]
    pub const fn needs_conversion(&self) -> bool {
        self.original.is_some()
    }

    /// What to hand a converter, or `None` if nothing needs converting.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::ConversionNotPossible`] if the request is incoherent, which
    /// [`ImportPlan::new`] does not produce — the `Result` is here because
    /// [`ConversionRequest::new`] enforces that rule itself rather than trusting callers,
    /// and saying so costs a `?` while an `expect` would be banned by §4 and worse.
    pub fn conversion_request(&self) -> Result<Option<ConversionRequest>, CoreError> {
        let Some(original) = self.original.as_ref() else {
            return Ok(None);
        };

        // Vault-relative: a converter runs against real files, not against what a manifest
        // says about them.
        ConversionRequest::new(
            self.bundle.join(original)?,
            self.format,
            self.document_in_vault()?,
        )
        .map(Some)
    }

    /// The source record to write once the imported bytes are on disk.
    ///
    /// `imported` is the fingerprint of the one file that now exists. Which field it lands
    /// in is this method's decision, not the caller's: see the module note.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidManifest`] if the record would be inconsistent, which
    /// a plan from [`ImportPlan::new`] cannot produce.
    pub fn source(&self, imported: Fingerprint) -> Result<Source, CoreError> {
        let source = Source::new(
            self.document.clone(),
            self.original.clone(),
            self.conversion.clone(),
        )?;

        if self.needs_conversion() {
            source.with_fingerprints(None, Some(imported))
        } else {
            source.with_fingerprints(Some(imported), None)
        }
    }
}
