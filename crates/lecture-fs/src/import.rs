//! Bringing a document into the vault.
//!
//! [`ImportPlan`] decided what goes where; this executes it. The order of operations is
//! the whole design, because an import is the one moment a file someone cares about exists
//! in exactly one place.
//!
//! # The manifest is written before the converter runs
//!
//! Three saves per import, not one:
//!
//! 1. **`Queued`**, as soon as the file is in the vault. A lecture *is* a directory holding
//!    `manifest.json`, so until this lands the vault walk cannot see the bundle at all — an
//!    import interrupted before it would leave an orphaned file in a folder nothing lists.
//! 2. **`Converting`**, immediately before the process starts.
//! 3. **`Ready`** or **`Failed`**, once it has finished.
//!
//! Step 2 is what makes an interrupted conversion *detectable*. [`Conversion`] only allows
//! `succeeded` and `did_not_finish` out of `Converting`, so `Converting` sitting on disk
//! can mean one thing: a process started and never came back. Collapsing the three saves
//! into one at the end would be fewer writes and would make a killed import indistinguishable
//! from one that never started. Each save is a few hundred bytes, written atomically.
//!
//! # A failed conversion is not a failed import
//!
//! `CLAUDE.md` §1.4: a conversion that fails keeps the original. The file is in the vault
//! and the manifest describes it truthfully, so [`Importer::import`] returns `Ok` — with
//! the failure carried in [`ImportOutcome::conversion_error`] rather than discarded, so a
//! caller can show the person what went wrong and what to do about it.
//!
//! The same is true of having no converter at all: the conversion stays `Queued`, which is
//! exactly what should happen when `LibreOffice` is installed later.

use std::path::Path;

use lecture_core::{
    Clock, Conversion, CoreError, DocumentConverterPort, DocumentFormat, Facets, ImportPlan, Label,
    LectureNumber, Manifest, OrderKey, RelativePath, SOURCE_DIR_NAME, Slug, Source,
};

use crate::manifest_store::ManifestStore;
use crate::storage::AtomicFsStorage;

/// A document to bring in, and how it should be filed.
///
/// Plain fields because every one of them is a type that already validated itself; there is
/// no invariant left for a constructor to check.
#[derive(Debug)]
pub struct ImportRequest<'a> {
    /// The file being imported, which is outside the vault.
    pub file: &'a Path,
    /// The lecture directory it becomes, relative to the vault root.
    pub bundle: RelativePath,
    /// What the person knows this lecture by.
    pub title: Label,
    /// The lecture's number, if its file's name had one.
    pub number: Option<LectureNumber>,
    /// Where it sits among its siblings.
    pub sequence: OrderKey,
    /// The taxonomy the sidebar groups on.
    pub facets: Facets,
}

/// What an import ended up doing.
#[derive(Debug)]
pub struct ImportOutcome {
    /// The manifest as it was last written.
    ///
    /// Its `source.conversion` state is the answer to "can this be opened yet?":
    /// `NotRequired` or `Ready` means yes, `Queued` means no converter was available, and
    /// `Failed` means one ran and could not do it.
    pub manifest: Manifest,
    /// Why the conversion failed, when one ran and did not succeed.
    ///
    /// Carried rather than returned, because the import itself succeeded. Swallowing it
    /// would leave a `Failed` state with no way to say what went wrong.
    pub conversion_error: Option<CoreError>,
}

/// Imports documents into one vault.
pub struct Importer<C> {
    manifests: ManifestStore<C>,
    clock: C,
}

impl<C: Clock + Clone> Importer<C> {
    /// Imports into `storage`'s vault, timestamping with `clock`.
    pub fn new(storage: AtomicFsStorage, clock: C) -> Self {
        Self {
            manifests: ManifestStore::new(storage, clock.clone()),
            clock,
        }
    }

    /// The storage this writes through.
    #[must_use]
    pub fn storage(&self) -> &AtomicFsStorage {
        self.manifests.storage()
    }

    /// Brings `request.file` into the vault, converting it if a converter can.
    ///
    /// `converter` is offered rather than required. `None`, or one that does not handle the
    /// format, leaves the conversion `Queued` and is not an error — see the module note.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::UnsupportedDocumentFormat`] if the file's extension names no
    /// importable format, [`CoreError::Io`] if the copy or a save fails, and a containment
    /// error if `request.bundle` does not resolve safely inside the vault. A failure before
    /// the first save leaves the vault as it was; a failure after it leaves a lecture whose
    /// manifest truthfully says the conversion has not happened.
    pub fn import(
        &self,
        request: &ImportRequest<'_>,
        converter: Option<&dyn DocumentConverterPort>,
    ) -> Result<ImportOutcome, CoreError> {
        let format = format_of(request.file)?;
        let plan = ImportPlan::new(&request.bundle, format)?;

        let source_dir = request.bundle.child(Slug::internal(SOURCE_DIR_NAME)?)?;
        self.storage().create_dir(&source_dir)?;

        // One pass over the bytes: copied in and fingerprinted together.
        let imported = self.storage().copy_in(request.file, &plan.destination()?)?;

        let manifest = Manifest::new(
            request.title.clone(),
            request.sequence.clone(),
            plan.source(imported)?,
            self.clock.now()?,
        )
        .with_facets(request.facets.clone())
        .with_number(request.number.clone());

        // Save 1: the bundle becomes a lecture the vault walk can see.
        let manifest = self.manifests.save(&request.bundle, &manifest)?;

        self.convert(&request.bundle, &plan, manifest, converter, imported)
    }

    /// Runs the conversion, recording each state change before and after it happens.
    fn convert(
        &self,
        bundle: &RelativePath,
        plan: &ImportPlan,
        manifest: Manifest,
        converter: Option<&dyn DocumentConverterPort>,
        imported: lecture_core::Fingerprint,
    ) -> Result<ImportOutcome, CoreError> {
        let settled = |manifest| {
            Ok(ImportOutcome {
                manifest,
                conversion_error: None,
            })
        };

        let Some(conversion_request) = plan.conversion_request()? else {
            return settled(manifest);
        };

        // No converter, or none that handles this format, is not a failure: `Queued` is
        // already the truth and is what lets an install later finish the job.
        let Some(converter) = converter.filter(|found| found.supports(plan.format())) else {
            return settled(manifest);
        };

        // Save 2: `Converting` on disk, before a process exists that could be killed.
        let started = advance(manifest.source(), |conversion| {
            conversion.started(converter.label().clone())
        })?;
        let manifest = self
            .manifests
            .save(bundle, &manifest.with_source(started))?;

        match converter.convert(&conversion_request) {
            Ok(()) => {
                // The converter wrote this file directly, so it has never been streamed
                // past a fingerprinter.
                let document = self.storage().fingerprint_of(&plan.document_in_vault()?)?;
                let finished = advance(manifest.source(), |conversion| {
                    conversion.succeeded(self.clock.now()?)
                })?
                .with_fingerprints(Some(document), Some(imported))?;

                settled(
                    self.manifests
                        .save(bundle, &manifest.with_source(finished))?,
                )
            }
            Err(error) => {
                let stopped = advance(manifest.source(), Conversion::did_not_finish)?;

                Ok(ImportOutcome {
                    manifest: self
                        .manifests
                        .save(bundle, &manifest.with_source(stopped))?,
                    conversion_error: Some(error),
                })
            }
        }
    }
}

/// Moves a source's conversion on by one step.
fn advance(
    source: &Source,
    step: impl FnOnce(Conversion) -> Result<Conversion, CoreError>,
) -> Result<Source, CoreError> {
    source
        .clone()
        .with_conversion(step(source.conversion().clone())?)
}

/// Which format a file's extension names.
fn format_of(file: &Path) -> Result<DocumentFormat, CoreError> {
    let extension = file
        .extension()
        .and_then(|raw| raw.to_str())
        .ok_or_else(|| CoreError::UnsupportedDocumentFormat {
            extension: String::new(),
        })?;

    DocumentFormat::from_extension(extension)
}
