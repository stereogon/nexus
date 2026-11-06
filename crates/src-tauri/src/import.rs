//! Bringing a document into a vault.
//!
//! This is the command that makes a `manifest.json` exist. Opening a vault deliberately
//! writes nothing — a lecture is a directory holding a manifest, and manifests are created
//! by importing, not by looking.
//!
//! As everywhere in this crate, the decisions are not here. Where the file goes, what the
//! bundle is called, whether conversion is needed and what gets written in which order are
//! all `lecture-core` and `lecture-fs`'s answers; this assembles the request and turns the
//! outcome into a row.

use std::path::Path;

use lecture_convert::LibreOfficeConverter;
use lecture_core::{
    DocumentConverterPort, DocumentFormat, Facets, Label, LectureBundle, LectureNumber, OrderKey,
    RelativePath, Slug, placed_by_number, split_number,
};
use lecture_fs::{
    AtomicFsStorage, ImportRequest, Importer, ManifestStore, SystemClock, VaultLoader, VaultRoot,
};

use crate::vault::{CommandError, LectureRow, row};

/// Every extension the importer accepts, lowercase and without a dot.
///
/// A command rather than a list written into the frontend, because the formats the window
/// offers and the formats the importer enforces have to be one list. [`DocumentFormat`] is
/// the one that decides, and a format added there reaches the window without anyone
/// remembering to copy it across.
///
/// Pure, so unlike the rest of this module it does not need a worker thread: there is no
/// file to read and nothing to wait on.
#[tauri::command]
#[must_use]
pub fn importable_formats() -> Vec<&'static str> {
    DocumentFormat::ALL
        .iter()
        .map(|format| format.extension())
        .collect()
}

/// Imports `file` into the vault at `vault`, converting it if a converter can.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault cannot be opened, the file is not a format Nexus
/// imports, or a lecture of that name already exists. A conversion that *fails* is not an
/// error: the original is kept and the returned row says `failed`, because a document Nexus
/// cannot render is still a document the person may want to keep notes beside.
///
/// # Why this runs on a worker thread
///
/// A sync Tauri command runs on the **main** thread, and this one copies a whole file and
/// may wait on `LibreOffice` for several seconds — which would freeze the window exactly as
/// the folder picker did. `spawn_blocking` is explicit about moving that work off the main
/// thread rather than relying on the macro's threading, which is the mistake that caused
/// the picker deadlock.
#[tauri::command]
pub async fn import_document(vault: String, file: String) -> Result<LectureRow, CommandError> {
    tauri::async_runtime::spawn_blocking(move || bring_in(&vault, &file))
        .await
        .map_err(|_| CommandError {
            code: "ERR_IMPORT_INTERRUPTED",
            remediation: "The import stopped before it finished. Nothing was changed in the \
                          vault; try adding the document again.",
        })?
}

/// The blocking half: everything that touches the disk.
///
/// Public because it, and not the command, is the testable unit — the `async` wrapper only
/// decides which thread this runs on, and a test that went through it would be testing
/// Tauri's runtime rather than the import.
///
/// # Errors
///
/// See [`import_document`], which is this with a thread chosen for it.
pub fn bring_in(vault: &str, file: &str) -> Result<LectureRow, CommandError> {
    let root = VaultRoot::open(Path::new(vault))?;
    let source = Path::new(file);
    let stem = stem_of(source)?;
    // The folder is named from the whole file name, number included, so `Week 1 Lecture 1`
    // and `Week 1 Lecture 2` cannot collide over the title they share once it is taken out.
    let bundle = RelativePath::root_level(Slug::from_title(stem)?);
    let named = split_number(stem);
    let title = Label::parse(&named.title)?;

    let loaded = VaultLoader::new(ManifestStore::new(
        AtomicFsStorage::new(root.clone()),
        SystemClock,
    ))
    .load()?;

    if loaded
        .bundles
        .iter()
        .any(|held| held.directory() == &bundle)
    {
        return Err(CommandError {
            code: "ERR_LECTURE_ALREADY_HERE",
            remediation: "A lecture with this name is already in the vault. Rename the file \
                          you are adding, or open the lecture that is already there.",
        });
    }

    // `sequence` is authoritative, so this is the one decision that fixes where the lecture
    // appears: placed by its number among the numbered lectures, or after the last lecture
    // when its name had none.
    let sequence = match &named.number {
        Some(number) => placed_by_number(&order_of(&loaded.bundles), number)?,
        None => OrderKey::between(
            loaded
                .bundles
                .iter()
                .map(|held| held.manifest().sequence())
                .max(),
            None,
        )?,
    };

    let request = ImportRequest {
        file: source,
        bundle: bundle.clone(),
        title,
        number: named.number,
        sequence,
        facets: Facets::default(),
    };

    // Offered, not required: without `LibreOffice` a PDF still imports, and anything else is
    // kept with its conversion queued rather than refused.
    let converter = LibreOfficeConverter::discover(AtomicFsStorage::new(root.clone()))?;
    let importer = Importer::new(AtomicFsStorage::new(root), SystemClock);
    let outcome = importer.import(
        &request,
        converter
            .as_ref()
            .map(|found| found as &dyn DocumentConverterPort),
    )?;

    Ok(row(&LectureBundle::new(bundle, outcome.manifest)))
}

/// The file's own name, without its extension: where the title and number come from.
///
/// A guess, and deliberately a plain one: the person can rename the lecture and change its
/// number, and inventing something cleverer would mean two places disagreeing about it.
fn stem_of(file: &Path) -> Result<&str, CommandError> {
    file.file_stem()
        .and_then(|name| name.to_str())
        .ok_or(CommandError {
            code: "ERR_UNUSABLE_FILE_NAME",
            remediation: "That file's name cannot be used as a lecture title. Rename the \
                          file so it has a plain name, then add it again.",
        })
}

/// Every lecture's place and number, for placing a numbered one among them.
pub(crate) fn order_of(bundles: &[LectureBundle]) -> Vec<(OrderKey, Option<LectureNumber>)> {
    bundles
        .iter()
        .map(|held| {
            (
                held.manifest().sequence().clone(),
                held.manifest().number().cloned(),
            )
        })
        .collect()
}
