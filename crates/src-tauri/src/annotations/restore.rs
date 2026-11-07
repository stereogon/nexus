//! Putting an annotation back exactly as it was: what undoing a removal needs.
//!
//! Undo could re-add a removed highlight with `add_highlight`, but that mints a new id, and
//! the id is what `cite://<id>` in the notes points at. Undoing a mistaken Remove would
//! then leave every citation of it saying the highlight was removed — the very thing the
//! person just took back. So the annotation comes back whole: the same id, the same
//! timestamps, the same rectangles.
//!
//! It arrives from the window, so it is validated twice on the way in, as anything read
//! from a file is: by deserialisation (each field's type checks itself) and by
//! [`AnnotationSet::insert`], which checks the annotation as a whole.

use lecture_core::{Annotation, RelativePath};

use crate::annotations::store;
use crate::vault::CommandError;

/// Puts `annotation` back on the lecture, returning it as stored.
///
/// One already there with that id is answered without a write: the outcome asked for —
/// that it is there — already holds, and a redo pressed twice is not a reason to rewrite
/// the file. What is answered then is the one *held*, which is what the window should draw.
///
/// # Errors
///
/// Returns [`CommandError`] if the lecture cannot be read, if the annotation is not a
/// valid one, or if the write fails — in which case the file is left as it was.
#[tauri::command]
pub async fn restore_annotation(
    vault: String,
    directory: String,
    annotation: Annotation,
) -> Result<Annotation, CommandError> {
    tauri::async_runtime::spawn_blocking(move || put_back(&vault, &directory, annotation))
        .await
        .map_err(|_| CommandError {
            code: "ERR_HIGHLIGHT_INTERRUPTED",
            remediation: "Bringing the highlight back stopped before it finished. The document's \
                          highlights are as they were; try undoing again.",
        })?
}

/// The blocking half of [`restore_annotation`], which is also the testable one.
///
/// # Errors
///
/// See [`restore_annotation`].
pub fn put_back(
    vault: &str,
    directory: &str,
    annotation: Annotation,
) -> Result<Annotation, CommandError> {
    let bundle = RelativePath::parse(directory)?;
    let annotations = store(vault)?;
    let mut set = annotations.load(&bundle)?;

    if let Some(held) = set.get(annotation.id()) {
        return Ok(held.clone());
    }

    set.insert(annotation.clone())?;
    annotations.save(&bundle, &set)?;

    Ok(annotation)
}
