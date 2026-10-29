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
    /// Invisible and control characters are **stripped rather than refused**, which is
    /// where this parts company with [`Label`](crate::domain::Label). Text pulled out of a
    /// PDF carries soft hyphens, zero-width joiners and stray controls as a matter of
    /// course — the reader did not put them there and cannot take them out — so refusing
    /// would lose a highlight for a reason nobody can act on. See
    /// [`text::strip_unprintable`] for why that is also no less safe.
    ///
    /// *(Changed 2026-10-29, after highlighting a formula reading "R cap" failed with
    /// `ERR_INVALID_NAME` and a sentence about folder names.)*
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidExcerpt`] if nothing visible survives, or if what
    /// survives exceeds 4000 bytes.
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        let normalised = text::normalise(&text::strip_unprintable(raw));

        if normalised.is_empty() {
            return Err(CoreError::InvalidExcerpt {
                reason: "contains no visible text",
            });
        }

        if normalised.len() > MAX_BYTES {
            return Err(CoreError::InvalidExcerpt {
                reason: "is longer than a highlight can hold",
            });
        }

        Ok(Self(normalised))
    }

    /// The normalised text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
