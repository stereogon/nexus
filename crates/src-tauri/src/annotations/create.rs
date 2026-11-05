//! Making annotations: a highlight over selected text, and a box drawn around part of a
//! page.
//!
//! Apart from reading and changing them (`mod.rs`) because making one is the only path
//! that mints an id and builds an annotation from what the window sends — so it is the
//! only path that needs `IdSource`, and the only one where a refused input must never
//! reach the file. Split out on 2026-11-05, when area highlights took the module past the
//! 300-line limit in `CLAUDE.md` §4.

use lecture_core::{
    Annotation, Clock, Excerpt, HighlightSemantic, IdSource, NormalizedRect, PageNumber,
    RelativePath,
};
use lecture_fs::{SystemClock, SystemIds};
use serde::Deserialize;

use super::store;
use crate::vault::CommandError;

/// A highlight the window is asking to store.
///
/// `rects` arrive already normalised against the unscaled page, which is §3's rule and
/// the reason a highlight lands in the same place at any zoom and on any screen. They are
/// deserialised as [`NormalizedRect`], so a rectangle outside `[0, 1]` is refused at the
/// boundary rather than written and discovered later.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewHighlight {
    /// The page it sits on, counting from 1.
    pub page: u32,
    /// What the highlight marks.
    pub semantic: HighlightSemantic,
    /// The text covered, so a citation can show it without reopening the PDF.
    pub quote: String,
    /// One rectangle per line of selected text.
    pub rects: Vec<NormalizedRect>,
}

/// A box drawn around a diagram, an equation or a scanned region, which the window is
/// asking to store.
///
/// For the parts of a slide that have no text to select. Deserialised as a
/// [`NormalizedRect`], so a region outside the page is refused at the boundary.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewArea {
    /// The page it sits on, counting from 1.
    pub page: u32,
    /// What the highlight marks.
    pub semantic: HighlightSemantic,
    /// The region covered, normalised against the unscaled page.
    pub region: NormalizedRect,
}

/// A sticky note the window is asking to put on a page.
///
/// Free-standing — the user's choice on 2026-11-05 — so it is the existing text-box kind:
/// created beside a highlight, independent of it afterwards. The text is an [`Excerpt`],
/// one paragraph; see `PROGRESS.md` for why line breaks are not kept.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTextBox {
    /// The page it sits on, counting from 1.
    pub page: u32,
    /// Where it sits and how big it is, normalised against the unscaled page.
    pub region: NormalizedRect,
    /// What was written.
    pub text: String,
}

/// Stores a highlight over selected text, returning the annotation as saved.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the lecture cannot be read, if the page number
/// is zero, if the quote or a rectangle is unusable, or if the write fails — in which case
/// the previous file is left exactly as it was.
#[tauri::command]
pub async fn add_highlight(
    vault: String,
    directory: String,
    highlight: NewHighlight,
) -> Result<Annotation, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        write_highlight(&vault, &directory, highlight, &SystemIds, &SystemClock)
    })
    .await
    .map_err(|_| CommandError {
        code: "ERR_HIGHLIGHT_INTERRUPTED",
        remediation: "Saving the highlight stopped before it finished. The lecture's other \
                      highlights are unchanged; make it again.",
    })?
}

/// Stores a box drawn around part of a page, returning the annotation as saved.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the lecture cannot be read, if the page number
/// is zero, or if the write fails — in which case the previous file is left as it was.
#[tauri::command]
pub async fn add_area_highlight(
    vault: String,
    directory: String,
    area: NewArea,
) -> Result<Annotation, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        write_area(&vault, &directory, area, &SystemIds, &SystemClock)
    })
    .await
    .map_err(|_| CommandError {
        code: "ERR_HIGHLIGHT_INTERRUPTED",
        remediation: "Saving the highlight stopped before it finished. The lecture's other \
                      highlights are unchanged; draw it again.",
    })?
}

/// The blocking half of [`add_highlight`], which is also the testable one.
///
/// Takes the ports rather than reaching for them, so a test can assert the exact id and
/// timestamp that were stored.
///
/// # Errors
///
/// See [`add_highlight`].
pub fn write_highlight(
    vault: &str,
    directory: &str,
    highlight: NewHighlight,
    ids: &impl IdSource,
    clock: &impl Clock,
) -> Result<Annotation, CommandError> {
    let bundle = RelativePath::parse(directory)?;
    let annotations = store(vault)?;

    let made = Annotation::text_highlight(
        ids.fresh()?,
        PageNumber::new(highlight.page)?,
        highlight.semantic,
        Excerpt::parse(&highlight.quote)?,
        highlight.rects,
        clock.now()?,
    )?;

    // Loaded here rather than before the annotation is built, so a highlight that cannot
    // be constructed never touches the file at all.
    let mut set = annotations.load(&bundle)?;

    set.insert(made.clone())?;
    annotations.save(&bundle, &set)?;

    Ok(made)
}

/// The blocking half of [`add_area_highlight`], which is also the testable one.
///
/// # Errors
///
/// See [`add_area_highlight`].
pub fn write_area(
    vault: &str,
    directory: &str,
    area: NewArea,
    ids: &impl IdSource,
    clock: &impl Clock,
) -> Result<Annotation, CommandError> {
    let bundle = RelativePath::parse(directory)?;
    let annotations = store(vault)?;

    // No caption: a box is drawn around something with no text to quote, and asking for
    // one at the moment of drawing would put a form between the reader and the slide.
    let made = Annotation::area_highlight(
        ids.fresh()?,
        PageNumber::new(area.page)?,
        area.semantic,
        area.region,
        None,
        clock.now()?,
    );

    let mut set = annotations.load(&bundle)?;

    set.insert(made.clone())?;
    annotations.save(&bundle, &set)?;

    Ok(made)
}

/// Puts a sticky note on a page, returning it as saved.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the lecture cannot be read, if the page number
/// is zero, if the text has nothing visible in it, or if the write fails.
#[tauri::command]
pub async fn add_text_box(
    vault: String,
    directory: String,
    note: NewTextBox,
) -> Result<Annotation, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        write_text_box(&vault, &directory, &note, &SystemIds, &SystemClock)
    })
    .await
    .map_err(|_| CommandError {
        code: "ERR_HIGHLIGHT_INTERRUPTED",
        remediation: "Saving the sticky note stopped before it finished. The lecture's other \
                      notes are unchanged; write it again.",
    })?
}

/// The blocking half of [`add_text_box`], which is also the testable one.
///
/// # Errors
///
/// See [`add_text_box`].
pub fn write_text_box(
    vault: &str,
    directory: &str,
    note: &NewTextBox,
    ids: &impl IdSource,
    clock: &impl Clock,
) -> Result<Annotation, CommandError> {
    let bundle = RelativePath::parse(directory)?;
    let annotations = store(vault)?;

    // Built before the file is loaded, so a note with no words never touches it.
    let made = Annotation::text_box(
        ids.fresh()?,
        PageNumber::new(note.page)?,
        note.region,
        Excerpt::parse(&note.text)?,
        clock.now()?,
    );

    let mut set = annotations.load(&bundle)?;

    set.insert(made.clone())?;
    annotations.save(&bundle, &set)?;

    Ok(made)
}
