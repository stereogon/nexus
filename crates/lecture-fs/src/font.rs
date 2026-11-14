//! Which font this device draws the window in (2026-11-14, at the user's request, after
//! Slack's setting): the theme's own, a face made for legibility, or monospace.
//!
//! `font.txt` in `~/Library/Application Support/Nexus/`, beside [`crate::theme`] and
//! [`crate::window_layout`] and for the same reasons: §3 puts per-device state outside the
//! vault. One word, as the theme is one word.
//!
//! A value that will not read is not logged, as a bad layout is not: the window opens in the
//! theme's font, on screen, and choosing a font writes a good value over the bad one.

use std::fmt;
use std::path::Path;

use lecture_core::CoreError;
use serde::{Deserialize, Serialize};

use crate::device_state::state_base;
use crate::error::io_error;
use crate::storage::AtomicFsStorage;
use crate::vault_root::VaultRoot;

/// Names the font to use on launch.
pub const FONT_FILE_NAME: &str = "font.txt";

/// A font, as the window names it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Font {
    /// The theme's own: the brand's faces, or the one a theme brings, as Funky does.
    #[default]
    Theme,
    /// Atkinson Hyperlegible Next, made for legibility.
    Readable,
    /// IBM Plex Mono, everywhere.
    Mono,
}

impl Font {
    /// The stored word, which is also what the window sends.
    #[must_use]
    pub fn word(self) -> &'static str {
        match self {
            Self::Theme => "theme",
            Self::Readable => "readable",
            Self::Mono => "mono",
        }
    }

    /// The font `word` names, or `None` if it names none.
    #[must_use]
    pub fn from_word(word: &str) -> Option<Self> {
        [Self::Theme, Self::Readable, Self::Mono]
            .into_iter()
            .find(|font| font.word() == word)
    }
}

impl fmt::Display for Font {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.word())
    }
}

fn file_path() -> Result<lecture_core::RelativePath, CoreError> {
    lecture_core::RelativePath::parse(FONT_FILE_NAME)
}

/// Records `font` for this device, under `base`.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if `base` cannot be created or the write fails.
pub fn remember(base: &Path, font: Font) -> Result<(), CoreError> {
    std::fs::create_dir_all(base)
        .map_err(|e| io_error("create the app support folder", base, e))?;

    let storage = AtomicFsStorage::new(VaultRoot::open(base)?);

    storage.write(&file_path()?, format!("{font}\n").as_bytes())
}

/// The font recorded for this device, or the theme's.
///
/// Infallible, like [`crate::window_layout::recall`]: nothing recorded, a file that will not
/// read and a hand-edited one all mean "use the theme's font".
#[must_use]
pub fn recall(base: &Path) -> Font {
    let read = || {
        let storage = AtomicFsStorage::new(VaultRoot::open(base).ok()?);
        let bytes = storage.read(&file_path().ok()?).ok()?;

        Font::from_word(String::from_utf8(bytes).ok()?.trim())
    };

    read().unwrap_or_default()
}

/// Records `font` in the real Application Support directory.
///
/// # Errors
///
/// As [`remember`], plus [`CoreError::HomeDirectoryUnavailable`] if `HOME` is unset.
pub fn remember_for_this_device(font: Font) -> Result<(), CoreError> {
    let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

    remember(&state_base(Path::new(&home)), font)
}

/// The font for this device, from the real Application Support directory.
#[must_use]
pub fn recall_for_this_device() -> Font {
    std::env::var_os("HOME")
        .map_or_else(Font::default, |home| recall(&state_base(Path::new(&home))))
}
