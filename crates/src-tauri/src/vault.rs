//! The IPC shapes the UI receives, and the one command that produces them.
//!
//! # Why there are separate DTOs at all
//!
//! `LectureBundle` already serializes — as a *manifest*, which is the on-disk schema and a
//! contract with files that exist. The UI wants something else: one flat row per lecture,
//! with the four things a sidebar shows. Sending the manifest would tie the shape of the
//! interface to the shape of the storage format, so that a change to either would be a
//! change to both.
//!
//! Translating between the two is this crate's whole job. It is not business logic — no
//! decision is made here that `lecture-core` has not already made.
//!
//! # Errors cross as a code and a remediation, never as `Display`
//!
//! `CLAUDE.md` §1.4 says every `CoreError` carries a machine code *and* a plain sentence
//! saying what to do next. That pair is exactly what a UI needs, so it is exactly what
//! crosses. `Display` is deliberately left behind: it interpolates paths, and a path a
//! webview holds can end up in a console log or a crash report, which §4 rules out.
//!
//! The cost is honest — a developer debugging from the UI sees `ERR_IO` rather than which
//! file — and the log is where that detail belongs, keyed by the same code.

use lecture_core::{ConversionState, CoreError, Label};
use lecture_fs::{
    AtomicFsStorage, LoadedVault, ManifestStore, SystemClock, VaultLoader, VaultRoot, last_vault,
    logging,
};
use serde::Serialize;

/// A failure, in the only two terms the UI needs.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    /// The stable identifier, safe to branch on in the UI.
    pub code: &'static str,
    /// One plain sentence saying what to do next.
    pub remediation: &'static str,
}

impl From<CoreError> for CommandError {
    fn from(error: CoreError) -> Self {
        Self {
            code: error.code(),
            remediation: error.remediation(),
        }
    }
}

/// A number found in a title, and the title without it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberInTitle {
    /// The number found.
    pub number: String,
    /// The title with it taken out.
    pub title: String,
}

/// One lecture, as a sidebar row.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LectureRow {
    /// The bundle directory, relative to the vault root.
    pub directory: String,
    /// `document` for something imported, `note` for a plain note made in Nexus.
    pub kind: &'static str,
    /// What the person knows it by.
    pub title: String,
    /// When it was made, RFC 3339 in UTC: shown under the notes' title.
    pub created_at: String,
    /// Its number in the course, if it has one.
    pub number: Option<String>,
    /// For a lecture with no number whose title holds one — anything imported before
    /// numbers were their own field — the number and the title without it, by the rules an
    /// import uses, for the editor to offer. Offered, never applied: rewriting every
    /// manifest on opening the vault would be a change nobody asked for.
    pub number_in_title: Option<NumberInTitle>,
    /// The authoritative order key.
    pub sequence: String,
    /// The facets the sidebar groups on.
    pub course: Option<String>,
    /// The module facet, if it has one.
    pub module: Option<String>,
    /// The week facet, if it has one.
    pub week: Option<String>,
    /// Free-form tags.
    pub tags: Vec<String>,
    /// The conversion state, by name.
    pub conversion: &'static str,
    /// Whether the PDF can be opened yet.
    ///
    /// Sent rather than derived in the UI, so the rule for "openable" lives in one place —
    /// the domain — instead of being reimplemented in TypeScript against a state name.
    pub document_ready: bool,
}

/// Something the walk could not use, with a reason to show.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemRow {
    /// Where it is.
    pub directory: String,
    /// What to do about it.
    pub remediation: String,
}

/// Everything one vault contains, including what could not be read.
///
/// Three lists, mirroring `LoadedVault`, for the reason recorded there: a vault of three
/// hundred lectures with one corrupt manifest must still open.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSummary {
    /// The absolute path that was opened, for the window's title.
    pub root: String,
    /// The lectures that loaded, in path order.
    pub lectures: Vec<LectureRow>,
    /// The folders that hold items rather than being one, in path order. Listed apart so
    /// an empty folder still shows.
    pub folders: Vec<String>,
    /// Directories the walk declined to enter.
    pub skipped: Vec<ProblemRow>,
    /// Lectures found but not loadable.
    pub unloadable: Vec<ProblemRow>,
}

/// Opens a vault and lists what is in it.
///
/// # Errors
///
/// Returns [`CommandError`] if `path` cannot be used as a vault, or if the root itself
/// cannot be read. One unreadable folder or one corrupt manifest is reported in the
/// summary instead, not as a failure.
#[tauri::command]
pub fn open_vault(path: &str) -> Result<VaultSummary, CommandError> {
    let started = std::time::Instant::now();
    let root = VaultRoot::open(std::path::Path::new(path))?;
    let opened = root.as_path().display().to_string();
    let loader = VaultLoader::new(ManifestStore::new(AtomicFsStorage::new(root), SystemClock));
    let walked = loader.load()?;

    // The one event an ordinary, successful session produces. Without it the log stayed
    // empty on every run that went right, which read as logging being broken -- see the
    // 2026-10-29 note in PROGRESS.md.
    lecture_fs::logging::vault_opened(
        walked.bundles.len(),
        walked.skipped.len(),
        walked.unloadable.len(),
        started.elapsed(),
    );

    Ok(summarise(opened, &walked))
}

/// Flattens a loaded vault into the rows the UI draws.
fn summarise(root: String, loaded: &LoadedVault) -> VaultSummary {
    VaultSummary {
        root,
        lectures: loaded.bundles.iter().map(row).collect(),
        folders: loaded.folders.iter().map(ToString::to_string).collect(),
        skipped: loaded
            .skipped
            .iter()
            .map(|skipped| ProblemRow {
                directory: skipped.shown_path.clone(),
                remediation: skipped.reason.remediation().to_owned(),
            })
            .collect(),
        unloadable: loaded
            .unloadable
            .iter()
            .map(|lecture| ProblemRow {
                directory: lecture.directory.to_string(),
                remediation: lecture.error.remediation().to_owned(),
            })
            .collect(),
    }
}

pub(crate) fn row(bundle: &lecture_core::LectureBundle) -> LectureRow {
    let manifest = bundle.manifest();
    let facets = manifest.facets();
    let source = manifest.source();

    LectureRow {
        directory: bundle.directory().to_string(),
        kind: if source.is_some() { "document" } else { "note" },
        title: manifest.title().as_str().to_owned(),
        created_at: manifest.created_at().as_str().to_owned(),
        number: manifest.number().map(|number| number.as_str().to_owned()),
        number_in_title: number_in_title(manifest),
        sequence: manifest.sequence().as_str().to_owned(),
        course: facets.course().map(label),
        module: facets.module().map(label),
        week: facets.week().map(label),
        tags: facets.tags().iter().map(label).collect(),
        // A note has nothing to convert and nothing to render, which is what these say.
        conversion: source.map_or("notRequired", |held| name_of(held.conversion().state())),
        document_ready: source.is_some_and(lecture_core::Source::document_is_ready),
    }
}

fn number_in_title(manifest: &lecture_core::Manifest) -> Option<NumberInTitle> {
    if manifest.number().is_some() {
        return None;
    }

    let split = lecture_core::split_number(manifest.title().as_str());

    // Only when taking it out leaves a title: `03` alone is its own name.
    split
        .number
        .filter(|_| split.title != manifest.title().as_str())
        .map(|number| NumberInTitle {
            number: number.as_str().to_owned(),
            title: split.title,
        })
}

fn label(label: &Label) -> String {
    label.as_str().to_owned()
}

/// The wire name of a conversion state.
///
/// Spelled out rather than taken from `ConversionState`'s `Debug`, so that renaming a
/// variant cannot silently change a string the UI matches on.
const fn name_of(state: ConversionState) -> &'static str {
    match state {
        ConversionState::NotRequired => "notRequired",
        ConversionState::Queued => "queued",
        ConversionState::Converting => "converting",
        ConversionState::Ready => "ready",
        ConversionState::Failed => "failed",
    }
}

/// Records the vault to reopen on the next launch.
///
/// Separate from [`open_vault`] rather than folded into it, because `open_vault` runs again
/// after every import and every edit, while a person *choosing* a vault happens once — and
/// that is the event worth recording. It also keeps this crate's read command a read.
///
/// Deliberately infallible, following `device_state`'s breadcrumb: failing to write a
/// convenience must never be the reason opening a vault reports an error. A failure is
/// logged as its code, and the person simply picks their vault again next time.
#[tauri::command]
pub fn remember_vault(path: &str) {
    if let Err(error) = record(path) {
        logging::failure("remember the vault to reopen", &error);
    }
}

/// The fallible half, so the command itself stays one decision.
fn record(path: &str) -> Result<(), CoreError> {
    let root = VaultRoot::open(std::path::Path::new(path))?;

    last_vault::remember_for_this_device(&root)
}

/// The vault to reopen, if one was recorded and is still there.
///
/// `None` covers every absence — nothing recorded yet, or a vault since moved, renamed or
/// deleted. They are not distinguished because the UI's answer to all of them is the same
/// screen, and inventing a difference here would invite a branch that cannot be useful.
#[tauri::command]
#[must_use]
pub fn last_vault() -> Option<String> {
    last_vault::recall_for_this_device().map(|path| path.display().to_string())
}
