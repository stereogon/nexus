//! Which layout this device draws the window in: Classic, the panes edge to edge, or
//! Islands, each pane a rounded island on one base (2026-11-14, at the user's request).
//!
//! `window-layout.txt` in `~/Library/Application Support/Nexus/`, beside [`crate::theme`] and
//! [`crate::pane_width`] and for the same reasons: §3 puts per-device state outside the vault.
//! One word, as the theme is one word.
//!
//! A value that will not read is not logged, as a bad pane width is not: the window opens in
//! Classic, on screen, and choosing a layout writes a good value over the bad one.

use std::fmt;
use std::path::Path;

use lecture_core::CoreError;
use serde::{Deserialize, Serialize};

use crate::device_state::state_base;
use crate::error::io_error;
use crate::storage::AtomicFsStorage;
use crate::vault_root::VaultRoot;

/// Names the layout to use on launch.
pub const LAYOUT_FILE_NAME: &str = "window-layout.txt";

/// A layout, as the window names it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowLayout {
    /// The panes edge to edge, divided by hairlines.
    #[default]
    Classic,
    /// Each pane a rounded island on one base that fills the window.
    Islands,
}

impl WindowLayout {
    /// The stored word, which is also what the window sends.
    #[must_use]
    pub fn word(self) -> &'static str {
        match self {
            Self::Classic => "classic",
            Self::Islands => "islands",
        }
    }

    /// The layout `word` names, or `None` if it names none.
    #[must_use]
    pub fn from_word(word: &str) -> Option<Self> {
        [Self::Classic, Self::Islands]
            .into_iter()
            .find(|layout| layout.word() == word)
    }
}

impl fmt::Display for WindowLayout {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.word())
    }
}

fn file_path() -> Result<lecture_core::RelativePath, CoreError> {
    lecture_core::RelativePath::parse(LAYOUT_FILE_NAME)
}

/// Records `layout` for this device, under `base`.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if `base` cannot be created or the write fails.
pub fn remember(base: &Path, layout: WindowLayout) -> Result<(), CoreError> {
    std::fs::create_dir_all(base)
        .map_err(|e| io_error("create the app support folder", base, e))?;

    let storage = AtomicFsStorage::new(VaultRoot::open(base)?);

    storage.write(&file_path()?, format!("{layout}\n").as_bytes())
}

/// The layout recorded for this device, or Classic.
///
/// Infallible, like [`crate::pane_width::recall`]: nothing recorded, a file that will not
/// read and a hand-edited one all mean "open in Classic".
#[must_use]
pub fn recall(base: &Path) -> WindowLayout {
    let read = || {
        let storage = AtomicFsStorage::new(VaultRoot::open(base).ok()?);
        let bytes = storage.read(&file_path().ok()?).ok()?;

        WindowLayout::from_word(String::from_utf8(bytes).ok()?.trim())
    };

    read().unwrap_or_default()
}

/// Records `layout` in the real Application Support directory.
///
/// # Errors
///
/// As [`remember`], plus [`CoreError::HomeDirectoryUnavailable`] if `HOME` is unset.
pub fn remember_for_this_device(layout: WindowLayout) -> Result<(), CoreError> {
    let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

    remember(&state_base(Path::new(&home)), layout)
}

/// The layout for this device, from the real Application Support directory.
#[must_use]
pub fn recall_for_this_device() -> WindowLayout {
    std::env::var_os("HOME").map_or_else(WindowLayout::default, |home| {
        recall(&state_base(Path::new(&home)))
    })
}
