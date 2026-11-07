//! How wide this device shows a resizable pane: the notes beside a document, and the
//! sidebar (added 2026-11-07, when the user asked for it to be dragged like the notes).
//!
//! One file per pane in `~/Library/Application Support/Nexus/`, beside [`crate::theme`] and
//! for the same reasons: §3 puts per-device state outside the vault. A laptop screen and an
//! external monitor want different widths, and neither is a choice a sync client should
//! carry to the other device.
//!
//! One number of CSS pixels, as one line of text, as the theme is one word.
//!
//! # Why a bad value is not logged
//!
//! The theme logs a value it cannot read, because "the setting silently did not stick" is
//! otherwise invisible there. A width is not invisible: the pane opens at its default width,
//! on screen, and dragging its divider writes a good value over the bad one. Logging it
//! would need a `CoreError` for a preference nobody is told about.

use std::ops::RangeInclusive;
use std::path::Path;

use lecture_core::CoreError;
use serde::Deserialize;

use crate::device_state::state_base;
use crate::error::io_error;
use crate::storage::AtomicFsStorage;
use crate::vault_root::VaultRoot;

/// A pane whose width can be dragged, as the window names it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Pane {
    /// The notes beside a document.
    Notes,
    /// The folder sidebar.
    Sidebar,
}

impl Pane {
    /// The file the width is kept in. The notes' name predates the sidebar's, and is kept so
    /// a width chosen before the sidebar could be dragged is still found.
    #[must_use]
    pub fn file_name(self) -> &'static str {
        match self {
            Self::Notes => "notes-width.txt",
            Self::Sidebar => "sidebar-width.txt",
        }
    }

    /// The widths a person could have chosen. Below the low end the pane cannot hold its
    /// content (a line of prose; a row's name); above the high end is wider than any display
    /// a laptop drives at one CSS pixel per point, so a hand-edit or a bug, not a choice.
    #[must_use]
    pub fn plausible_widths(self) -> RangeInclusive<u32> {
        match self {
            Self::Notes => 240..=4000,
            Self::Sidebar => 160..=1200,
        }
    }
}

fn file_path(pane: Pane) -> Result<lecture_core::RelativePath, CoreError> {
    lecture_core::RelativePath::parse(pane.file_name())
}

/// `width` if it is one a person could have chosen for `pane`, else `None`.
#[must_use]
pub fn plausible(pane: Pane, width: u32) -> Option<u32> {
    pane.plausible_widths().contains(&width).then_some(width)
}

/// Records `width` for `pane` on this device, under `base`, held to the plausible range.
///
/// Clamped rather than refused: the window has already drawn the pane at the width being
/// recorded, so the nearest width that can be kept is closer to the truth than none.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if `base` cannot be created or the write fails.
pub fn remember(base: &Path, pane: Pane, width: u32) -> Result<(), CoreError> {
    std::fs::create_dir_all(base)
        .map_err(|e| io_error("create the app support folder", base, e))?;

    let storage = AtomicFsStorage::new(VaultRoot::open(base)?);
    let range = pane.plausible_widths();
    let kept = width.clamp(*range.start(), *range.end());

    storage.write(&file_path(pane)?, format!("{kept}\n").as_bytes())
}

/// The width recorded for `pane` on this device, or `None` for the default.
///
/// Infallible, like [`crate::theme::recall`]: nothing recorded, a file that will not read
/// and a hand-edited one all mean "open at the default width".
#[must_use]
pub fn recall(base: &Path, pane: Pane) -> Option<u32> {
    let storage = AtomicFsStorage::new(VaultRoot::open(base).ok()?);
    let bytes = storage.read(&file_path(pane).ok()?).ok()?;
    let text = String::from_utf8(bytes).ok()?;

    plausible(pane, text.trim().parse().ok()?)
}

/// Records `width` for `pane` in the real Application Support directory.
///
/// # Errors
///
/// As [`remember`], plus [`CoreError::HomeDirectoryUnavailable`] if `HOME` is unset.
pub fn remember_for_this_device(pane: Pane, width: u32) -> Result<(), CoreError> {
    let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

    remember(&state_base(Path::new(&home)), pane, width)
}

/// The width for `pane` on this device, from the real Application Support directory.
#[must_use]
pub fn recall_for_this_device(pane: Pane) -> Option<u32> {
    recall(&state_base(Path::new(&std::env::var_os("HOME")?)), pane)
}
