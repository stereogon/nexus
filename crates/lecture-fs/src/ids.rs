//! Minting annotation ids on this machine.

use lecture_core::{AnnotationId, CoreError, IdSource};

use crate::unique::token;

/// Mints ids from the machine clock, the process id and a counter.
///
/// The scheme is `crate::unique`'s, shared with the staging-file names, so there is one
/// answer in this crate to "how is something made unique" rather than two.
///
/// Ids are **not** prefixed with `hl-` or anything else describing the kind. `AnnotationId`
/// explains why: an id is a name, not a description, and encoding the kind would mean
/// converting a highlight into a text box changed its id and broke every `cite://` link
/// pointing at it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SystemIds;

impl SystemIds {
    /// An id source using this machine's clock and process.
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl IdSource for SystemIds {
    fn fresh(&self) -> Result<AnnotationId, CoreError> {
        AnnotationId::parse(&token())
    }
}
