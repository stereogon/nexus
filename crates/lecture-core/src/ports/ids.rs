//! Minting an annotation's identity.
//!
//! A fresh id needs a source of uniqueness — a clock, a process id, an entropy pool —
//! and all three are platform calls. So this is a port for the same reason
//! [`Clock`](crate::ports::Clock) is: the domain stays free of them, and anything that
//! mints an id can be tested against known ids rather than against whatever the machine
//! produced that run.
//!
//! # Why the domain does not simply hash the contents
//!
//! A content hash would be shorter to write and needs no port at all. It is also wrong
//! here: an id is quoted in `notes.md` as `cite://<id>`, so it has to survive the
//! annotation being edited. Highlighting one more word would change a content hash and
//! silently break every citation pointing at it, which is the one failure this value
//! exists to prevent.

use crate::domain::AnnotationId;
use crate::error::CoreError;

/// A source of identities no existing annotation holds.
pub trait IdSource {
    /// Mints an id for a new annotation.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if the adapter produces something unusable in a
    /// `cite://` link, which is a broken adapter rather than a broken caller.
    fn fresh(&self) -> Result<AnnotationId, CoreError>;
}

/// Ids counting up from one, for tests.
///
/// Counting rather than fixed, because the invariant most worth testing is that two
/// annotations never share an id — and a double handing out one value would make that
/// test pass for the wrong reason. Lives beside the trait rather than in a test module so
/// adapter crates and integration tests can use it instead of each writing their own.
#[derive(Debug)]
pub struct SequentialIds {
    prefix: &'static str,
    next: core::sync::atomic::AtomicU32,
}

impl SequentialIds {
    /// Ids of the form `<prefix>1`, `<prefix>2`, and so on.
    #[must_use]
    pub const fn new(prefix: &'static str) -> Self {
        Self {
            prefix,
            next: core::sync::atomic::AtomicU32::new(1),
        }
    }
}

impl Default for SequentialIds {
    fn default() -> Self {
        Self::new("test-")
    }
}

impl IdSource for SequentialIds {
    fn fresh(&self) -> Result<AnnotationId, CoreError> {
        let at = self
            .next
            .fetch_add(1, core::sync::atomic::Ordering::Relaxed);

        AnnotationId::parse(&format!("{}{at}", self.prefix))
    }
}
