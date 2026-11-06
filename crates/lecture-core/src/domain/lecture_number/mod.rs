//! A lecture's number, as the course numbers it: `3`, `3a`, `3.1`, `IV`.
//!
//! Added in manifest version 3 (2026-11-05). Until then the number a person saw was an
//! accident of the file name: the name became the title *and* the folder name, and the
//! sidebar read digits off the folder — so editing the title left the number behind, and
//! the number had no say in the order. Now it is its own field, taken from the file name at
//! import ([`split_number`]), editable, and what places the lecture ([`placed_by_number`]).
//!
//! # Ordering
//!
//! Natural, not textual: `2` before `10`, `3` before `3a` before `3b`, and a number with
//! leading digits before one without (`12` before `IV`). Leading zeros do not count.

mod place;
mod split;

use std::cmp::Ordering;
use std::fmt;

use serde::{Deserialize, Serialize};

pub use place::placed_by_number;
pub use split::{SplitTitle, split_number};

/// The longest number kept, in characters. `Lecture 12b` is the number `12b`; anything as
/// long as this is a title, not a number.
pub const MAX_NUMBER_CHARS: usize = 12;

/// A lecture's number: letters, digits, `.` and `-`, at most [`MAX_NUMBER_CHARS`] long.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct LectureNumber(String);

impl LectureNumber {
    /// The number in `text`, trimmed, or `None` if it is empty, too long, or holds anything
    /// but letters, digits, `.` and `-`.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let trimmed = text.trim();
        let length = trimmed.chars().count();
        let usable = trimmed
            .chars()
            .all(|character| character.is_alphanumeric() || character == '.' || character == '-');

        (length > 0 && length <= MAX_NUMBER_CHARS && usable).then(|| Self(trimmed.to_owned()))
    }

    /// The number as written.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The leading digits' value without leading zeros, and what follows them.
    fn parts(&self) -> (Option<&str>, &str) {
        let digits = self.0.len()
            - self
                .0
                .trim_start_matches(|c: char| c.is_ascii_digit())
                .len();
        let (number, rest) = self.0.split_at(digits);

        if number.is_empty() {
            (None, rest)
        } else {
            let significant = number.trim_start_matches('0');

            (
                Some(if significant.is_empty() {
                    "0"
                } else {
                    significant
                }),
                rest,
            )
        }
    }
}

impl Ord for LectureNumber {
    fn cmp(&self, other: &Self) -> Ordering {
        let (mine, my_rest) = self.parts();
        let (theirs, their_rest) = other.parts();

        let by_number = match (mine, theirs) {
            // Compared as digit strings of equal standing: longer is larger, then by digit,
            // so a number of any length orders correctly without being parsed into an int.
            (Some(a), Some(b)) => a.len().cmp(&b.len()).then_with(|| a.cmp(b)),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => Ordering::Equal,
        };

        by_number
            .then_with(|| my_rest.to_lowercase().cmp(&their_rest.to_lowercase()))
            .then_with(|| self.0.cmp(&other.0))
    }
}

impl PartialOrd for LectureNumber {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Display for LectureNumber {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl TryFrom<String> for LectureNumber {
    type Error = crate::CoreError;

    /// Read from a manifest. A number nobody could have typed is a hand edit gone wrong, and
    /// is refused as the manifest being inconsistent rather than silently dropped.
    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value).ok_or(crate::CoreError::InvalidManifest {
            reason: "its lecture number is not one Nexus can use",
        })
    }
}

impl From<LectureNumber> for String {
    fn from(number: LectureNumber) -> Self {
        number.0
    }
}
