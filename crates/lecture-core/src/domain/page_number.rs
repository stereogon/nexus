//! Which page of a document something sits on.
//!
//! **Pages are numbered from 1.** The spec never says so outright, but its citation
//! format writes `[Slide/Page 4](cite://…)` beside `"pageNumber": 4`, and its test
//! journeys talk about "Page 2" — so the stored number is the one a person reads off the
//! screen, not an array index. Pinning it in a type is worth doing because an off-by-one
//! here is invisible: every highlight simply renders on the wrong page, and no test that
//! only round-trips data would notice.

use std::fmt;
use std::num::NonZeroU32;

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// A one-based page number.
///
/// `NonZeroU32` rather than a checked `u32`, so page zero cannot be constructed at all
/// and no caller has to defend against it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "u32", into = "u32")]
pub struct PageNumber(NonZeroU32);

impl TryFrom<u32> for PageNumber {
    type Error = CoreError;

    fn try_from(raw: u32) -> Result<Self, Self::Error> {
        Self::new(raw)
    }
}

impl From<PageNumber> for u32 {
    fn from(page: PageNumber) -> Self {
        page.0.get()
    }
}

impl fmt::Display for PageNumber {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0.get())
    }
}

impl PageNumber {
    /// The first page of a document.
    #[must_use]
    pub fn first() -> Self {
        Self(NonZeroU32::MIN)
    }

    /// A page number counting from 1.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidPageNumber`] for zero, which would mean a file that
    /// numbered pages from 0 — most likely a tool other than Nexus, and certainly not
    /// something to guess about.
    pub fn new(number: u32) -> Result<Self, CoreError> {
        NonZeroU32::new(number)
            .map(Self)
            .ok_or(CoreError::InvalidPageNumber { number })
    }

    /// The page number, counting from 1.
    #[must_use]
    pub fn get(self) -> u32 {
        self.0.get()
    }

    /// The matching index into a zero-based array of pages.
    ///
    /// Provided so the conversion happens in exactly one place rather than being written
    /// out wherever it is needed, which is how off-by-one errors spread.
    #[must_use]
    pub fn zero_based_index(self) -> usize {
        self.0.get() as usize - 1
    }
}
