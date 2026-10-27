//! Text quoted out of a document.
//!
//! An excerpt is the sentence or caption a highlight covers, copied into
//! `annotations.json` so a citation in `notes.md` can show what was highlighted without
//! re-opening the PDF, and so search can match on it.
//!
//! It shares [`Label`](crate::domain::Label)'s normalisation and differs only in length.
//! The normalisation matters more here, not less: text extracted from a PDF arrives with
//! line breaks wherever the typesetting happened to wrap, and storing those verbatim
//! would put ragged newlines into the middle of every citation.

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::domain::text;
use crate::error::CoreError;

/// The longest an excerpt may be, in bytes.
///
/// Set well above a long sentence so that highlighting a whole paragraph is never
/// refused — losing someone's highlight because it was generous would be a bad trade.
/// The cap exists to stop a corrupted file putting a megabyte of text in a field the UI
/// renders inline.
const MAX_BYTES: usize = 4_000;

/// Normalised text quoted from a document.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Excerpt(String);

impl TryFrom<String> for Excerpt {
    type Error = CoreError;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        Self::parse(&raw)
    }
}

impl From<Excerpt> for String {
    fn from(excerpt: Excerpt) -> Self {
        excerpt.0
    }
}

impl fmt::Display for Excerpt {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl Excerpt {
    /// Validates and normalises quoted text.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if nothing visible survives normalisation, if
    /// the text exceeds 4000 bytes, or if it contains a control or invisible character
    /// that is not whitespace.
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        let reject = |reason: &'static str| {
            Err(CoreError::InvalidName {
                name: truncate_for_error(raw),
                reason,
            })
        };

        if text::has_non_whitespace_control(raw) {
            return reject("contains a control character");
        }
        if text::has_invisible(raw) {
            return reject("contains an invisible character that could disguise the text");
        }

        let normalised = text::normalise(raw);

        if normalised.is_empty() {
            return reject("contains no visible text");
        }
        if normalised.len() > MAX_BYTES {
            return reject("is longer than a highlight can hold");
        }

        Ok(Self(normalised))
    }

    /// The normalised text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Shortens text for an error message.
///
/// An excerpt can be thousands of bytes, and the error is logged. `CLAUDE.md` §1.2 says
/// a person's study material is never written verbatim into diagnostics, so only enough
/// to identify which highlight failed goes into the message.
fn truncate_for_error(raw: &str) -> String {
    const KEEP: usize = 40;

    if raw.len() <= KEEP {
        return raw.to_owned();
    }

    let mut end = KEEP;
    while end > 0 && !raw.is_char_boundary(end) {
        end -= 1;
    }

    format!("{}…", raw.get(..end).unwrap_or(""))
}
