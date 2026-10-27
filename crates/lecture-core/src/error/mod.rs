//! Typed errors for every fallible operation in the domain.
//!
//! Each variant carries two things a caller cannot reconstruct on its own:
//!
//! - [`CoreError::code`] — a stable, machine-readable identifier, safe to match on in
//!   the UI and to assert on in tests. These strings are part of the public contract
//!   and must not be reworded once shipped.
//! - [`CoreError::remediation`] — one plain sentence telling the person what to do
//!   next. The reader is a tired student the night before an exam, not a developer
//!   reading a stack trace.
//!
//! The enum is `#[non_exhaustive]`: variants are added as the code that raises them
//! lands, so this list always describes failures that can genuinely occur.

use std::fmt;

use thiserror::Error;

/// What happened to the copy of a damaged file.
///
/// Carried in the error so the message can state the truth. Static remediation text that
/// promised a `.bak` would be a lie whenever the copy itself failed, and being told
/// accurately where their work is, is the one thing a person needs to trust at that
/// moment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackupOutcome {
    /// A copy was saved at this path.
    Saved(String),
    /// A copy could not be saved, so the original is all there is -- and it is intact.
    Failed,
}

impl fmt::Display for BackupOutcome {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Saved(path) => write!(f, "a copy of it has been saved as `{path}`"),
            Self::Failed => f.write_str(
                "a copy of it could not be saved, so the original has been left exactly as it is",
            ),
        }
    }
}

/// Every way a domain operation can fail.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum CoreError {
    /// A coordinate was not a usable normalized value: not finite, or outside `[0, 1]`.
    #[error("coordinate `{field}` is {value}, which is not a normalized value in [0.0, 1.0]")]
    InvalidCoordinate {
        /// Which component failed, e.g. `"x"` or `"height"`.
        field: &'static str,
        /// The offending value, reproduced so logs are diagnosable.
        value: f64,
    },

    /// A rectangle was individually in range but extended past the page edge.
    #[error("rectangle extends past the page edge: {field} reaches {reach}, past 1.0")]
    RectOutOfBounds {
        /// Which edge overflowed: `"x + width"` or `"y + height"`.
        field: &'static str,
        /// How far the edge actually reached.
        reach: f64,
    },

    /// A name could not be used as a single path segment on disk.
    #[error("`{name}` cannot be used as a file or folder name: {reason}")]
    InvalidName {
        /// The rejected text.
        name: String,
        /// Which rule it broke.
        reason: &'static str,
    },

    /// A path could not be used as a relative location.
    #[error("`{path}` is not a usable relative location: {reason}")]
    InvalidRelativePath {
        /// The rejected path.
        path: String,
        /// Which rule it broke.
        reason: &'static str,
    },

    /// A path sat deeper than the depth cap allows.
    #[error("`{path}` is {depth} levels deep, past the limit of {max}")]
    RelativePathTooDeep {
        /// The rejected path.
        path: String,
        /// How deep it actually was.
        depth: usize,
        /// The cap it passed.
        max: usize,
    },

    /// A folder could not be opened as a vault root.
    #[error("`{path}` cannot be used as a vault: {reason}")]
    VaultRootUnusable {
        /// The folder that was offered.
        path: String,
        /// Why it is unusable.
        reason: &'static str,
    },

    /// A component of a path inside the vault was a symbolic link.
    ///
    /// Refused whatever the link points at, including another location inside the same
    /// vault: an alias creates two routes to one bundle, which double-counts lectures
    /// on a vault walk and can make a sync client chase its own tail.
    #[error("`{path}` is an alias, and Nexus does not follow aliases inside a vault")]
    SymlinkRefused {
        /// The offending component.
        path: String,
    },

    /// A path resolved to a location outside the vault root.
    #[error("`{path}` resolves to a location outside the vault")]
    PathEscapesVault {
        /// The path as it was requested.
        path: String,
    },

    /// A filesystem operation failed.
    ///
    /// Carries what was being attempted and on what, because "permission denied" with
    /// no subject is not something anyone can act on.
    #[error("could not {operation} `{path}`")]
    Io {
        /// The attempted operation, phrased to complete the sentence above.
        operation: &'static str,
        /// What it was attempted on.
        path: String,
        /// The underlying failure.
        #[source]
        source: std::io::Error,
    },

    /// A string was not a timestamp in the one canonical stored form.
    #[error("`{value}` is not a usable timestamp: {reason}")]
    InvalidTimestamp {
        /// The rejected text, or the offending value for a clock out of range.
        value: String,
        /// Which rule it broke.
        reason: &'static str,
    },

    /// A manifest parsed but described something that cannot be true.
    #[error("this lecture's manifest is inconsistent: {reason}")]
    InvalidManifest {
        /// Which invariant it broke.
        reason: &'static str,
    },

    /// A stored file's bytes could not be parsed.
    #[error("`{file}` could not be read: {detail} ({backup})")]
    StoredFileUnreadable {
        /// Which file, so the message can name it. One of the schema file-name
        /// constants, never a full path -- the path is in `backup`.
        file: &'static str,
        /// What the parser objected to, including where. Kept because "could not be
        /// read" alone is not something anyone can act on, and a line and column turns
        /// a broken hand-edit into a ten-second fix.
        detail: String,
        /// Whether the damaged file was copied aside, and to where.
        backup: BackupOutcome,
    },

    /// A stored file was written by a build with a different schema version.
    ///
    /// Reported *without* touching the file, which is the whole point of the variant:
    /// a newer file is not damaged, and rewriting or backing it up would destroy data
    /// an updated Nexus could read.
    #[error("`{file}` is schema version {found}; this build reads version {supported}")]
    SchemaVersionUnsupported {
        /// Which file, so the message can name it.
        file: &'static str,
        /// The version the file claims.
        found: u32,
        /// The version this build understands.
        supported: u32,
    },

    /// A page number was zero, so it cannot be a one-based page.
    #[error("page {number} is not a page; documents are numbered from 1")]
    InvalidPageNumber {
        /// The rejected number.
        number: u32,
    },

    /// An annotation described something that cannot be drawn or linked to.
    #[error("an annotation is not usable: {reason}")]
    InvalidAnnotation {
        /// Which invariant it broke.
        reason: &'static str,
    },

    /// Two annotations claimed the same identifier.
    #[error("two annotations share the identifier `{id}`")]
    DuplicateAnnotationId {
        /// The repeated identifier.
        id: String,
    },

    /// A string was not a well-formed order key.
    #[error("`{key}` is not a valid order key: {reason}")]
    InvalidOrderKey {
        /// The rejected text, reproduced so a corrupt manifest is diagnosable.
        key: String,
        /// Which rule it broke.
        reason: &'static str,
    },

    /// Two order keys were given in the wrong order, so nothing can sit between them.
    #[error("order keys are not ascending: `{lower}` is not before `{upper}`")]
    OrderKeysNotAscending {
        /// The key offered as the lower bound.
        lower: String,
        /// The key offered as the upper bound.
        upper: String,
    },

    /// The orderable range ran out at one end.
    ///
    /// Reaching this requires on the order of 10^46 insertions at the same extreme, so
    /// in practice it means a key was fabricated rather than generated.
    #[error("no order key can be placed beyond `{bound}`")]
    OrderSpaceExhausted {
        /// The boundary key that could not be stepped past.
        bound: String,
    },
}

mod guidance;
