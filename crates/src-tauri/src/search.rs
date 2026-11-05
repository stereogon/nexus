//! Searching the vault's notes and highlights, and listing every highlight in it.
//!
//! # Why the window says which lectures
//!
//! Both commands take the lecture directories the window already holds from opening the
//! vault, rather than walking the vault again on every keystroke. Each one is parsed as a
//! `RelativePath` like any other path from the window, so nothing outside the vault can
//! be named.
//!
//! # A lecture that cannot be read
//!
//! One lecture with a damaged `notes.md` or `annotations.json` must not make the whole
//! search fail. It is skipped and counted, and the window says how many were — the same
//! file shows its own error, with its remediation, when that lecture is opened. Reading
//! a damaged file copies it aside first, as opening the lecture would.

use std::path::Path;

use lecture_core::{Annotation, HighlightSemantic, LineMatch, RelativePath, SearchQuery, Snippet};
use lecture_fs::{AnnotationStore, AtomicFsStorage, NotesStore, VaultRoot};
use serde::Serialize;

use crate::vault::CommandError;

/// At most this many lines of one lecture's notes are listed; the rest are counted.
pub const NOTE_LINES_PER_LECTURE: usize = 3;

/// At most this many highlights of one lecture are listed.
pub const MARKS_PER_LECTURE: usize = 5;

/// At most this many results in all, so a one-letter query cannot build a huge answer.
pub const MAX_RESULTS: usize = 100;

/// A highlight or sticky note whose text contains the query.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkHit {
    /// What `cite://` points at, and what the window jumps to.
    pub id: String,
    /// Counting from 1.
    pub page: u32,
    /// `None` for a sticky note, which has no meaning.
    pub semantic: Option<HighlightSemantic>,
    /// Where in its text.
    pub snippet: Snippet,
}

/// One lecture's matches.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LectureHits {
    /// The lecture, as the window named it.
    pub directory: String,
    /// Matching lines of its notes, the first few.
    pub notes: Vec<LineMatch>,
    /// How many lines of its notes matched in all.
    pub note_lines: usize,
    /// Its matching highlights and sticky notes, the first few.
    pub marks: Vec<MarkHit>,
}

/// What a search of the vault found.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSearch {
    /// Lectures with at least one match, in the order the window listed them.
    pub lectures: Vec<LectureHits>,
    /// Lectures whose notes or highlights could not be read, and were not searched.
    pub unreadable: usize,
    /// Whether results were left out to stay under [`MAX_RESULTS`].
    pub truncated: bool,
}

/// One lecture's highlights and sticky notes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LectureMarks {
    /// The lecture, as the window named it.
    pub directory: String,
    /// Everything marked on it, in stored order.
    pub annotations: Vec<Annotation>,
}

/// Every highlight in the vault.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultMarks {
    /// Lectures with at least one annotation, in the order the window listed them.
    pub lectures: Vec<LectureMarks>,
    /// Lectures whose highlights could not be read.
    pub unreadable: usize,
}

const INTERRUPTED: CommandError = CommandError {
    code: "ERR_SEARCH_INTERRUPTED",
    remediation: "Searching the vault stopped before it finished. Nothing was changed; try \
                  again.",
};

/// Finds `query` in the notes and highlights of `directories`.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault cannot be opened or a directory is not a path
/// inside it. A lecture that cannot be read is counted, not an error.
#[tauri::command]
pub async fn search_vault(
    vault: String,
    directories: Vec<String>,
    query: String,
) -> Result<VaultSearch, CommandError> {
    tauri::async_runtime::spawn_blocking(move || find_in_vault(&vault, &directories, &query))
        .await
        .map_err(|_| INTERRUPTED)?
}

/// Every highlight and sticky note on `directories`.
///
/// # Errors
///
/// As [`search_vault`].
#[tauri::command]
pub async fn vault_highlights(
    vault: String,
    directories: Vec<String>,
) -> Result<VaultMarks, CommandError> {
    tauri::async_runtime::spawn_blocking(move || marks_in_vault(&vault, &directories))
        .await
        .map_err(|_| INTERRUPTED)?
}

/// The blocking half of [`search_vault`], which is also the testable one.
///
/// # Errors
///
/// See [`search_vault`].
pub fn find_in_vault(
    vault: &str,
    directories: &[String],
    query: &str,
) -> Result<VaultSearch, CommandError> {
    let mut found = VaultSearch {
        lectures: Vec::new(),
        unreadable: 0,
        truncated: false,
    };
    let Some(query) = SearchQuery::parse(query) else {
        return Ok(found);
    };
    let (notes, marks) = stores(vault)?;
    let mut results = 0;

    for directory in directories {
        let bundle = RelativePath::parse(directory)?;
        let (Ok(text), Ok(set)) = (notes.load(&bundle), marks.load(&bundle)) else {
            found.unreadable += 1;
            continue;
        };

        if results >= MAX_RESULTS {
            found.truncated = true;
            break;
        }

        let (lines, note_lines) = query.lines(&text.text, NOTE_LINES_PER_LECTURE);
        let hits: Vec<MarkHit> = set
            .all()
            .iter()
            .filter_map(|annotation| {
                Some(MarkHit {
                    id: annotation.id().as_str().to_owned(),
                    page: annotation.page().get(),
                    semantic: annotation.semantic(),
                    snippet: query.snippet(annotation.text()?.as_str())?,
                })
            })
            .take(MARKS_PER_LECTURE)
            .collect();

        if !lines.is_empty() || !hits.is_empty() {
            results += lines.len() + hits.len();
            found.lectures.push(LectureHits {
                directory: directory.clone(),
                notes: lines,
                note_lines,
                marks: hits,
            });
        }
    }

    Ok(found)
}

/// The blocking half of [`vault_highlights`], which is also the testable one.
///
/// # Errors
///
/// See [`vault_highlights`].
pub fn marks_in_vault(vault: &str, directories: &[String]) -> Result<VaultMarks, CommandError> {
    let (_, marks) = stores(vault)?;
    let mut found = VaultMarks {
        lectures: Vec::new(),
        unreadable: 0,
    };

    for directory in directories {
        match marks.load(&RelativePath::parse(directory)?) {
            Ok(set) if !set.is_empty() => found.lectures.push(LectureMarks {
                directory: directory.clone(),
                annotations: set.all().to_vec(),
            }),
            Ok(_) => {}
            Err(_) => found.unreadable += 1,
        }
    }

    Ok(found)
}

fn stores(vault: &str) -> Result<(NotesStore, AnnotationStore), CommandError> {
    let root = Path::new(vault);

    Ok((
        NotesStore::new(AtomicFsStorage::new(VaultRoot::open(root)?)),
        AnnotationStore::new(AtomicFsStorage::new(VaultRoot::open(root)?)),
    ))
}
