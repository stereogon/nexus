//! Whether this device shows documents' pages dark in a dark theme (2026-11-14, at the
//! user's request; amending §3, which had ruled inversion out). Off unless chosen: inverting
//! a page turns photographs and scans into negatives, so it is the person's call, made
//! knowing that, and never the app's default.
//!
//! `page-tone.txt` in `~/Library/Application Support/Nexus/`, beside the theme, the font and
//! the layout (§3, per-device state outside the vault).

use std::fmt;
use std::path::Path;

use lecture_core::CoreError;
use serde::{Deserialize, Serialize};

use crate::device_word;

/// Names the page tone to use on launch.
pub const PAGE_TONE_FILE_NAME: &str = "page-tone.txt";

/// How a document's pages are drawn in a dark theme, as the window names it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PageTone {
    /// As printed: the page stays light, on a dark bed.
    #[default]
    Printed,
    /// Inverted, keeping each colour's hue, to sit with the dark theme.
    Dark,
}

impl PageTone {
    /// The stored word, which is also what the window sends.
    #[must_use]
    pub fn word(self) -> &'static str {
        match self {
            Self::Printed => "printed",
            Self::Dark => "dark",
        }
    }

    /// The tone `word` names, or `None` if it names none.
    #[must_use]
    pub fn from_word(word: &str) -> Option<Self> {
        [Self::Printed, Self::Dark]
            .into_iter()
            .find(|tone| tone.word() == word)
    }
}

impl fmt::Display for PageTone {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.word())
    }
}

/// Records `tone` for this device, under `base`.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if `base` cannot be created or the write fails.
pub fn remember(base: &Path, tone: PageTone) -> Result<(), CoreError> {
    device_word::remember(base, PAGE_TONE_FILE_NAME, tone.word())
}

/// The tone recorded for this device, or as printed.
///
/// Infallible: nothing recorded, a file that will not read and a hand-edited one all mean
/// the pages stay as printed.
#[must_use]
pub fn recall(base: &Path) -> PageTone {
    device_word::recall(base, PAGE_TONE_FILE_NAME)
        .and_then(|word| PageTone::from_word(&word))
        .unwrap_or_default()
}

/// Records `tone` in the real Application Support directory.
///
/// # Errors
///
/// As [`remember`], plus [`CoreError::HomeDirectoryUnavailable`] if `HOME` is unset.
pub fn remember_for_this_device(tone: PageTone) -> Result<(), CoreError> {
    remember(&device_word::this_device()?, tone)
}

/// The tone for this device, from the real Application Support directory.
#[must_use]
pub fn recall_for_this_device() -> PageTone {
    device_word::this_device().map_or_else(|_| PageTone::default(), |base| recall(&base))
}
