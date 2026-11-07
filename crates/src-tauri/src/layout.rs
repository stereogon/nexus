//! Reading and recording how wide this device shows the notes and the sidebar.
//!
//! Two commands, matching `last_theme` / `remember_theme`, and infallible for the same
//! reasons: the window is already drawn at the width being recorded, so a failed write
//! costs the next launch and is logged by code, not shown. Which pane is the window's
//! choice, refused at this boundary if it names neither.

use lecture_fs::logging;
use lecture_fs::pane_width::{self, Pane};

/// The width this device last chose for `pane`, in CSS pixels, or `null` for the default.
#[tauri::command]
#[must_use]
pub fn last_pane_width(pane: Pane) -> Option<u32> {
    pane_width::recall_for_this_device(pane)
}

/// Records the width of `pane`.
#[tauri::command]
pub fn remember_pane_width(pane: Pane, width: u32) {
    if let Err(error) = pane_width::remember_for_this_device(pane, width) {
        logging::failure("record a pane width", &error);
    }
}
