//! How wide this device shows the notes beside a document.
//!
//! `~/Library/Application Support/Nexus/notes-width.txt`, beside [`crate::theme`] and for
//! the same reasons: §3 puts per-device state outside the vault. A laptop screen and an
//! external monitor want different widths, and neither is a choice a sync client should
//! carry to the other device.
//!
//! One number of CSS pixels, as one line of text, as the theme is one word.
//!
//! # Why a bad value is not logged
//!
//! The theme logs a value it cannot read, because "the setting silently did not stick" is
//! otherwise invisible there. A width is not invisible: the notes open at their default
//! width, on screen, and dragging the divider writes a good value over the bad one. Logging
//! it would need a `CoreError` for a preference nobody is told about.

use std::path::Path;

use lecture_core::CoreError;

use crate::device_state::state_base;
use crate::error::io_error;
use crate::storage::AtomicFsStorage;
use crate::vault_root::VaultRoot;

/// Names the notes width to use on launch.
pub const NOTES_WIDTH_FILE_NAME: &str = "notes-width.txt";

/// The narrowest width kept. Below this the editor cannot hold a line of prose.
pub const MIN_NOTES_WIDTH: u32 = 240;

/// The widest width kept: wider than any display a laptop drives at one CSS pixel per
/// point. Anything above is a hand-edit or a bug, not a choice.
pub const MAX_NOTES_WIDTH: u32 = 4000;

fn file_path() -> Result<lecture_core::RelativePath, CoreError> {
    lecture_core::RelativePath::parse(NOTES_WIDTH_FILE_NAME)
}

/// `width` if it is one a person could have chosen, else `None`.
#[must_use]
pub fn plausible(width: u32) -> Option<u32> {
    (MIN_NOTES_WIDTH..=MAX_NOTES_WIDTH)
        .contains(&width)
        .then_some(width)
}

/// Records `width` for this device, under `base`, held to the plausible range.
///
/// Clamped rather than refused: the window has already drawn the notes at the width being
/// recorded, so the nearest width that can be kept is closer to the truth than none.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if `base` cannot be created or the write fails.
pub fn remember(base: &Path, width: u32) -> Result<(), CoreError> {
    std::fs::create_dir_all(base)
        .map_err(|e| io_error("create the app support folder", base, e))?;

    let storage = AtomicFsStorage::new(VaultRoot::open(base)?);
    let kept = width.clamp(MIN_NOTES_WIDTH, MAX_NOTES_WIDTH);

    storage.write(&file_path()?, format!("{kept}\n").as_bytes())
}

/// The width recorded for this device, or `None` for the default.
///
/// Infallible, like [`crate::theme::recall`]: nothing recorded, a file that will not read
/// and a hand-edited one all mean "open at the default width".
#[must_use]
pub fn recall(base: &Path) -> Option<u32> {
    let storage = AtomicFsStorage::new(VaultRoot::open(base).ok()?);
    let bytes = storage.read(&file_path().ok()?).ok()?;
    let text = String::from_utf8(bytes).ok()?;

    plausible(text.trim().parse().ok()?)
}

/// Records `width` in the real Application Support directory.
///
/// # Errors
///
/// As [`remember`], plus [`CoreError::HomeDirectoryUnavailable`] if `HOME` is unset.
pub fn remember_for_this_device(width: u32) -> Result<(), CoreError> {
    let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

    remember(&state_base(Path::new(&home)), width)
}

/// The width for this device, from the real Application Support directory.
#[must_use]
pub fn recall_for_this_device() -> Option<u32> {
    recall(&state_base(Path::new(&std::env::var_os("HOME")?)))
}
