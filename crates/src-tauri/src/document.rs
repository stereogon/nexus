//! Handing one lecture's PDF to the viewer, and refusing to hand over anything else.
//!
//! # The webview is given one file, not a directory
//!
//! Tauri's asset protocol is what lets the webview read a file from disk, and its scope is
//! what decides which. This grants exactly the document being opened — not the vault, and
//! certainly not a `$HOME/**` glob, which is the shape these configurations usually take.
//! The webview renders foreign documents, so its reach is the thing most worth keeping
//! small: if a bug in the page let an attacker read a file, the set of files it could name
//! is the set of lectures the person has already chosen to open in this session.
//!
//! # What is checked before the path is handed over
//!
//! The manifest says the document is ready; the path resolves inside the vault, which
//! [`VaultRoot::resolve`] guarantees rather than this module re-deriving it; the file
//! begins with the PDF signature; and the bytes are scanned for the indicators
//! [`DocumentRisk`] names. Only then does the scope open.
//!
//! The scan is **not** a gate. Nothing here refuses a document for having indicators,
//! because the viewer is already configured not to act on any of them, and a study app
//! that would not open a lecture deck for containing a hyperlink would be useless. The
//! scan is there so the person is told.

use std::path::Path;

use lecture_core::{DocumentRisk, LectureBundle, RelativePath, RiskSeverity};
use lecture_fs::{AtomicFsStorage, ManifestStore, SystemClock, VaultRoot, document_scan};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::vault::CommandError;

/// One indicator, in the terms the UI shows.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskRow {
    /// The stable identifier, safe to branch on.
    pub code: &'static str,
    /// `notable` or `informational`.
    pub severity: &'static str,
    /// What the document asks for, and what Nexus does about it.
    pub explanation: &'static str,
}

impl From<DocumentRisk> for RiskRow {
    fn from(risk: DocumentRisk) -> Self {
        Self {
            code: risk.code(),
            severity: risk.severity().code(),
            explanation: risk.explanation(),
        }
    }
}

/// Everything the viewer needs to open one lecture.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDocument {
    /// The absolute path, for the webview to read over the asset protocol.
    pub path: String,
    /// Its size in bytes.
    pub bytes: u64,
    /// What the surface scan found, worst first. Empty means nothing was found.
    pub risks: Vec<RiskRow>,
    /// Whether anything found deserves being shown before the document is.
    ///
    /// Decided here rather than in the UI, so the severity rule has one home. A second copy
    /// in TypeScript would be a copy to keep in step, and the first time it drifted the UI
    /// would either nag about hyperlinks or stay quiet about a launch action.
    pub needs_attention: bool,
}

/// Locates and screens a lecture's PDF.
///
/// Separate from the command so it can be tested without an `AppHandle`, which is the same
/// split `edit` uses. Everything that can be decided about the document is decided here;
/// the command adds only the scope grant, which needs a running app to have one.
///
/// # Errors
///
/// Returns [`CommandError`] if the lecture cannot be read, if its document is not ready
/// yet, or if the file is not a PDF.
pub fn prepare_document(vault: &str, directory: &str) -> Result<OpenedDocument, CommandError> {
    let root = VaultRoot::open(Path::new(vault))?;
    let bundle = RelativePath::parse(directory)?;
    let manifests = ManifestStore::new(AtomicFsStorage::new(root.clone()), SystemClock);
    let manifest = manifests.load(&bundle)?;

    if !manifest.source().document_is_ready() {
        return Err(CommandError {
            code: "ERR_DOCUMENT_NOT_READY",
            remediation: "This lecture has no PDF yet. Convert it first; the file you \
                          imported is still kept beside it.",
        });
    }

    let document = LectureBundle::new(bundle, manifest).document_path()?;
    let resolved = root.resolve(&document)?;
    let inspection = document_scan::inspect(resolved.as_path())?;

    if !inspection.is_pdf {
        return Err(CommandError {
            code: "ERR_NOT_A_PDF",
            remediation: "This lecture's PDF is not a PDF file. Re-import the original to \
                          rebuild it; the original is still in the lecture's folder.",
        });
    }

    Ok(OpenedDocument {
        path: resolved.as_path().display().to_string(),
        bytes: inspection.bytes,
        needs_attention: warrants_a_warning(&inspection.risks),
        risks: inspection.risks.into_iter().map(RiskRow::from).collect(),
    })
}

/// Opens a lecture's document for the viewer.
///
/// The grant is the last step, after every check in [`prepare_document`] has passed. A
/// path the window may read is a capability, so it is handed out only once there is a
/// screened PDF to justify it — a document that is missing, not ready or not a PDF widens
/// nothing.
///
/// # Errors
///
/// As [`prepare_document`], plus a failure to widen the scope — reported rather than
/// ignored, because the window would otherwise hold a path it is not allowed to read and
/// the failure would reach the person as a blank page with no reason.
///
/// `AppHandle` is taken by value because Tauri requires it: `CommandArg` is implemented for
/// `AppHandle`, not `&AppHandle`, so clippy's `needless_pass_by_value` suggestion here does
/// not compile. Checked rather than assumed — with a reference the macro fails with
/// `the trait bound &AppHandle: CommandArg is not satisfied`. The allow is on this function
/// alone, and names the reason, rather than being switched off for the crate.
#[allow(
    clippy::needless_pass_by_value,
    reason = "Tauri's CommandArg is implemented for AppHandle, not &AppHandle"
)]
#[tauri::command]
pub fn open_document(
    app: AppHandle,
    vault: &str,
    directory: &str,
) -> Result<OpenedDocument, CommandError> {
    let opened = prepare_document(vault, directory)?;

    app.asset_protocol_scope()
        .allow_file(&opened.path)
        .map_err(|_| CommandError {
            code: "ERR_DOCUMENT_UNREADABLE",
            remediation: "Nexus could not give its window permission to read this file. \
                          Reopening the vault usually clears it.",
        })?;

    Ok(opened)
}

/// Whether anything found deserves being shown before the document is.
///
/// Exposed so the decision lives beside the vocabulary rather than in the UI, where a
/// second copy of the severity rule would drift from this one.
#[must_use]
pub fn warrants_a_warning(risks: &[DocumentRisk]) -> bool {
    risks
        .iter()
        .any(|risk| risk.severity() == RiskSeverity::Notable)
}
