//! Reading and writing the highlights on a lecture.
//!
//! # Why the whole set is never sent from the UI
//!
//! Each command loads the set, changes one annotation, and writes it back, rather than
//! taking a set from the window and saving it wholesale. The difference matters on two
//! counts.
//!
//! A whole-set save makes the UI the owner of every annotation it holds, so anything it
//! failed to parse — a kind added by a newer build, an iPad that has run ahead — would be
//! dropped on the next highlight someone made. Load-change-save in one command means the
//! window never has to hold what it does not understand.
//!
//! It also keeps the read and the write adjacent. A set fetched, held while someone reads
//! three pages, and then saved would overwrite anything that changed in between.
//!
//! # Where the identity and the timestamp come from
//!
//! Both through ports: [`SystemIds`] and [`SystemClock`]. Not for ceremony — it is what
//! lets the same logic be driven by `SequentialIds` and `FixedClock` in a test, so the
//! stored shape can be asserted exactly rather than matched loosely against whatever the
//! clock said while the suite ran.

use std::path::Path;

use lecture_core::{
    Annotation, AnnotationId, Clock, Excerpt, HighlightSemantic, NormalizedRect, RelativePath,
};
use lecture_fs::{AnnotationStore, AtomicFsStorage, SystemClock, VaultRoot};

use serde::Deserialize;

use crate::vault::CommandError;

pub mod create;
pub mod restore;

pub use create::{
    NewArea, NewHighlight, NewTextBox, add_area_highlight, add_highlight, add_text_box, write_area,
    write_highlight, write_text_box,
};
pub use restore::{put_back, restore_annotation};

/// Every annotation on a lecture, in the order they are stored.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the lecture cannot be read. A lecture with no
/// annotations file is **not** an error: it yields an empty list, which is the normal
/// state of anything freshly imported.
#[tauri::command]
pub async fn load_annotations(
    vault: String,
    directory: String,
) -> Result<Vec<Annotation>, CommandError> {
    // A worker thread for the same reason as the import and the edit: a sync command runs
    // on the main one, and this reads a file.
    tauri::async_runtime::spawn_blocking(move || read_annotations(&vault, &directory))
        .await
        .map_err(|_| CommandError {
            code: "ERR_ANNOTATIONS_INTERRUPTED",
            remediation: "Reading the highlights stopped before it finished. Nothing was changed; try \
                          opening the document again.",
        })?
}

/// Removes one annotation, returning what was removed.
///
/// Removing something already gone is **not** an error: the outcome asked for is that it
/// is absent, and that is the outcome. It returns `None` so the window can tell the two
/// apart if it ever needs to.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the lecture cannot be read, if the id is not a
/// usable one, or if the write fails.
#[tauri::command]
pub async fn remove_annotation(
    vault: String,
    directory: String,
    id: String,
) -> Result<Option<Annotation>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || erase_annotation(&vault, &directory, &id))
        .await
        .map_err(|_| CommandError {
            code: "ERR_HIGHLIGHT_INTERRUPTED",
            remediation: "Removing the highlight stopped before it finished. The document's other \
                          highlights are unchanged; try again.",
        })?
}

/// Marks a highlight as something else — key, definition, exam or question — keeping its
/// id, and returns it as stored.
///
/// The id is kept because it is what `cite://<id>` in the notes points at. Before this
/// command, changing a highlight's meaning meant removing it and making a new one, which
/// would have broken every link to it.
///
/// Returns `None` when the lecture has no highlight with that id — removed on another
/// device, say — which is not an error for the same reason a remove of something absent
/// is not: there is nothing the person did wrong, and nothing was changed.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the lecture cannot be read, if the id is not a
/// usable one, or if the write fails — in which case the previous file is left as it was.
#[tauri::command]
pub async fn retag_annotation(
    vault: String,
    directory: String,
    id: String,
    semantic: HighlightSemantic,
) -> Result<Option<Annotation>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        rewrite_semantic(&vault, &directory, &id, semantic, &SystemClock)
    })
    .await
    .map_err(|_| CommandError {
        code: "ERR_HIGHLIGHT_INTERRUPTED",
        remediation: "Changing the highlight stopped before it finished. It still has its old \
                      colour, and the document's other highlights are unchanged; try again.",
    })?
}

/// What a sticky note's edit changes: where it is, what it says, or both.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextBoxEdit {
    /// Moved or resized to here, if it was.
    #[serde(default)]
    pub region: Option<NormalizedRect>,
    /// Reworded to this, if it was.
    #[serde(default)]
    pub text: Option<String>,
}

/// Moves, resizes or rewords a sticky note, keeping its id, and returns it as stored.
///
/// Returns `None` when the lecture has no sticky note with that id — removed elsewhere, or
/// a highlight — by the rule `retag_annotation` follows.
///
/// # Errors
///
/// Returns [`CommandError`] if the lecture cannot be read, if the id is not a usable one,
/// if new text has nothing visible in it, or if the write fails.
#[tauri::command]
pub async fn edit_text_box(
    vault: String,
    directory: String,
    id: String,
    edit: TextBoxEdit,
) -> Result<Option<Annotation>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        rewrite_text_box(&vault, &directory, &id, &edit, &SystemClock)
    })
    .await
    .map_err(|_| CommandError {
        code: "ERR_HIGHLIGHT_INTERRUPTED",
        remediation: "Changing the sticky note stopped before it finished. It is as it was; \
                      try again.",
    })?
}

/// Opens the store for one vault.
pub(crate) fn store(vault: &str) -> Result<AnnotationStore, CommandError> {
    Ok(AnnotationStore::new(AtomicFsStorage::new(VaultRoot::open(
        Path::new(vault),
    )?)))
}

/// The blocking half of [`load_annotations`], which is also the testable one.
///
/// # Errors
///
/// See [`load_annotations`].
pub fn read_annotations(vault: &str, directory: &str) -> Result<Vec<Annotation>, CommandError> {
    let bundle = RelativePath::parse(directory)?;

    Ok(store(vault)?.load(&bundle)?.all().to_vec())
}

/// The blocking half of [`remove_annotation`], which is also the testable one.
///
/// # Errors
///
/// See [`remove_annotation`].
pub fn erase_annotation(
    vault: &str,
    directory: &str,
    id: &str,
) -> Result<Option<Annotation>, CommandError> {
    let bundle = RelativePath::parse(directory)?;
    let annotations = store(vault)?;
    let mut set = annotations.load(&bundle)?;

    let removed = set.remove(&AnnotationId::parse(id)?);

    // Written only when something actually changed. A remove of something absent should
    // not rewrite the file, because a write that changes nothing is still a write someone
    // else's sync has to reconcile.
    if removed.is_some() {
        annotations.save(&bundle, &set)?;
    }

    Ok(removed)
}

/// The blocking half of [`retag_annotation`], which is also the testable one.
///
/// # Errors
///
/// See [`retag_annotation`].
pub fn rewrite_semantic(
    vault: &str,
    directory: &str,
    id: &str,
    semantic: HighlightSemantic,
    clock: &impl Clock,
) -> Result<Option<Annotation>, CommandError> {
    let bundle = RelativePath::parse(directory)?;
    let id = AnnotationId::parse(id)?;
    let annotations = store(vault)?;
    let mut set = annotations.load(&bundle)?;

    // Already marked that way: answered without a write, for the reason a remove of
    // something absent is. Choosing the colour a highlight already has is an ordinary
    // misclick, and turning it into a file change would hand every sync client a
    // conflict about nothing.
    if let Some(held) = set.get(&id)
        && held.semantic() == Some(semantic)
    {
        return Ok(Some(held.clone()));
    }

    let changed = set.retag(&id, semantic, &clock.now()?);

    if changed.is_some() {
        annotations.save(&bundle, &set)?;
    }

    Ok(changed)
}

/// The blocking half of [`edit_text_box`], which is also the testable one.
///
/// # Errors
///
/// See [`edit_text_box`].
pub fn rewrite_text_box(
    vault: &str,
    directory: &str,
    id: &str,
    edit: &TextBoxEdit,
    clock: &impl Clock,
) -> Result<Option<Annotation>, CommandError> {
    let bundle = RelativePath::parse(directory)?;
    let id = AnnotationId::parse(id)?;
    // Parsed before anything is loaded, so wording with nothing visible never touches the
    // file.
    let text = edit.text.as_deref().map(Excerpt::parse).transpose()?;
    let annotations = store(vault)?;
    let mut set = annotations.load(&bundle)?;

    let changed = set.rebox(&id, edit.region, text, &clock.now()?);

    if changed.is_some() {
        annotations.save(&bundle, &set)?;
    }

    Ok(changed)
}
