//! A short piece of human text, safe to store and to group on.
//!
//! Titles and facet values are not names on disk — they are read, displayed, and
//! **grouped**. That last one is why they need normalising rather than merely checking:
//! the sidebar groups lectures by facet value at runtime, so `"CS 454"` and `"CS  454"`
//! would silently become two separate courses. A [`Label`] collapses the differences that
//! carry no meaning, so equal-looking values are equal values.

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::domain::text;
use crate::error::CoreError;

/// The longest a label may be, in bytes.
///
/// Generous on purpose. This is not a filesystem limit — a `Slug` derived from a long
/// title simply truncates — so the cap exists only to stop a corrupted or hand-edited
/// file putting a megabyte of text where a course code belongs. A real lecture title
/// never approaches it, so nobody legitimate meets this wall.
const MAX_BYTES: usize = 500;

/// Validated, normalised display text.
///
/// Ordering is lexicographic on the normalised form, which is what lets tag sets be
/// stored in a stable order.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Label(String);

impl TryFrom<String> for Label {
    type Error = CoreError;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        Self::parse(&raw)
    }
}

impl From<Label> for String {
    fn from(label: Label) -> Self {
        label.0
    }
}

impl fmt::Display for Label {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl Label {
    /// Validates and normalises `raw`.
    ///
    /// Normalisation is NFC, then outer whitespace trimmed, then runs of inner
    /// whitespace collapsed to a single space. Each step exists to stop two values that
    /// look identical from grouping as two. As in [`Slug`](crate::domain::Slug), NFC and
    /// never NFKC — NFKC folds compatibility characters in ways that change what the
    /// text says.
    ///
    /// Tabs and newlines count as whitespace here and are collapsed, because a title
    /// pasted out of a PDF commonly contains them and refusing it would be hostile.
    /// Control characters that are not whitespace are refused.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if nothing survives normalisation, if the text
    /// is longer than 500 bytes, or if it contains a control or invisible character.
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        let reject = |reason: &'static str| {
            Err(CoreError::InvalidName {
                name: raw.to_owned(),
                reason,
            })
        };

        // Only non-whitespace control characters are refused. A tab or newline is both
        // a control character and whitespace, and almost always arrives from text
        // pasted out of a PDF, so it is collapsed rather than rejected. Checked before
        // normalising, so nothing is folded away before it can be objected to.
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
            return reject("is longer than 500 characters, which is longer than a title");
        }

        Ok(Self(normalised))
    }

    /// The normalised text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
