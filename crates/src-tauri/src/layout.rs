//! Reading and recording how wide this device shows the notes.
//!
//! Two commands, matching `last_theme` / `remember_theme`, and infallible for the same
//! reasons: the window is already drawn at the width being recorded, so a failed write
//! costs the next launch and is logged by code, not shown.

use lecture_fs::{logging, notes_width};

/// The notes width this device last chose, in CSS pixels, or `null` for the default.
#[tauri::command]
#[must_use]
pub fn last_notes_width() -> Option<u32> {
    notes_width::recall_for_this_device()
}

/// Records the notes width.
#[tauri::command]
pub fn remember_notes_width(width: u32) {
    if let Err(error) = notes_width::remember_for_this_device(width) {
        logging::failure("record the notes width", &error);
    }
}
