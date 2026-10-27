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

    /// A manifest's bytes could not be parsed.
    #[error("this lecture's manifest could not be read: {detail}; {backup}")]
    ManifestUnreadable {
        /// What the parser objected to, including where. Kept because "could not be
        /// read" alone is not something anyone can act on, and a line and column turns
        /// a broken hand-edit into a ten-second fix.
        detail: String,
        /// Whether the damaged file was copied aside, and to where.
        backup: BackupOutcome,
    },

    /// A manifest was written by a build that uses a different schema version.
    #[error("this lecture was saved by Nexus schema v{found}; this build reads v{supported}")]
    ManifestVersionUnsupported {
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

impl CoreError {
    /// A stable identifier for this failure.
    ///
    /// Part of the public contract. Shipped codes are never reworded; a new meaning
    /// gets a new code.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::InvalidCoordinate { .. } | Self::RectOutOfBounds { .. } => {
                "ERR_INVALID_COORDINATE"
            }
            Self::InvalidManifest { .. } => "ERR_INVALID_MANIFEST",
            Self::ManifestUnreadable { .. } => "ERR_MANIFEST_UNREADABLE",
            Self::ManifestVersionUnsupported { .. } => "ERR_MANIFEST_VERSION_UNSUPPORTED",
            Self::InvalidAnnotation { .. } => "ERR_INVALID_ANNOTATION",
            Self::DuplicateAnnotationId { .. } => "ERR_DUPLICATE_ANNOTATION_ID",
            Self::InvalidName { .. } => "ERR_INVALID_NAME",
            Self::InvalidPageNumber { .. } => "ERR_INVALID_PAGE_NUMBER",
            Self::InvalidTimestamp { .. } => "ERR_INVALID_TIMESTAMP",
            Self::VaultRootUnusable { .. } => "ERR_VAULT_ROOT_UNUSABLE",
            Self::SymlinkRefused { .. } => "ERR_SYMLINK_REFUSED",
            Self::PathEscapesVault { .. } => "ERR_PATH_ESCAPES_VAULT",
            Self::Io { .. } => "ERR_IO",
            Self::InvalidRelativePath { .. } => "ERR_INVALID_RELATIVE_PATH",
            Self::RelativePathTooDeep { .. } => "ERR_RELATIVE_PATH_TOO_DEEP",
            Self::InvalidOrderKey { .. } => "ERR_INVALID_ORDER_KEY",
            Self::OrderKeysNotAscending { .. } => "ERR_ORDER_KEYS_NOT_ASCENDING",
            Self::OrderSpaceExhausted { .. } => "ERR_ORDER_SPACE_EXHAUSTED",
        }
    }

    /// One plain sentence telling the person what to do about it.
    ///
    /// Never blames them, never names an internal symbol, and always suggests a next
    /// step — even when that step is only "report this".
    #[must_use]
    pub const fn remediation(&self) -> &'static str {
        match self {
            Self::InvalidCoordinate { .. } | Self::RectOutOfBounds { .. } => {
                "This highlight's position could not be read, so it was left out rather \
                 than drawn in the wrong place. Your notes and the rest of your \
                 highlights are untouched. If you edited annotations.json by hand, a \
                 backup is beside it."
            }
            Self::InvalidManifest { .. } => {
                "This lecture's details contradict each other, so it was left alone \
                 rather than loaded wrongly. Nothing was deleted. The message above \
                 says which detail does not add up."
            }
            Self::ManifestUnreadable { .. } => {
                "This lecture could not be loaded, and nothing on disk has been \
                 changed. The message above says what went wrong and where a copy of \
                 the file was kept, which you can open in any text editor."
            }
            Self::ManifestVersionUnsupported { .. } => {
                "This lecture was saved by a newer version of Nexus. It has been left \
                 completely untouched rather than rewritten, so updating Nexus will \
                 open it normally."
            }
            Self::InvalidName { .. } => {
                "That name cannot be used for a folder on disk. Nothing was created or \
                 renamed. Try a shorter name, or one without punctuation such as \
                 slashes or colons."
            }
            Self::VaultRootUnusable { .. } => {
                "Nexus could not open that folder as a vault. Nothing was changed. Check \
                 the folder still exists and that you have permission to open it."
            }
            Self::SymlinkRefused { .. } => {
                "That item is an alias pointing somewhere else, and Nexus does not \
                 follow aliases inside a vault — following one could put your notes \
                 outside the vault without you realising. Nothing was changed. Move the \
                 real folder into your vault instead."
            }
            Self::PathEscapesVault { .. } => {
                "That location turned out to sit outside your vault, so Nexus stopped \
                 before reading or writing anything. Nothing was changed."
            }
            Self::Io { .. } => {
                "A file operation did not finish, so it was abandoned rather than left \
                 half-done. Your existing notes and highlights are untouched. Check \
                 there is free disk space and that the vault folder is reachable, then \
                 try again."
            }
            Self::InvalidRelativePath { .. } => {
                "That location cannot be used inside your vault. Nothing was created or \
                 moved. Choose a folder inside the vault and try again."
            }
            Self::RelativePathTooDeep { .. } => {
                "That folder sits more than five levels deep inside your vault, which is \
                 further than Nexus will follow. Nothing was moved. Drag it nearer the \
                 top of the vault, then try again."
            }
            Self::InvalidAnnotation { .. } => {
                "One highlight could not be read, so it was left out rather than drawn \
                 in the wrong place. Your notes and your other highlights are \
                 untouched, and a backup of the file is beside it."
            }
            Self::DuplicateAnnotationId { .. } => {
                "Two highlights in this lecture share an identifier, so a link in your \
                 notes could point at either. Nothing was deleted, and a backup is \
                 beside the file."
            }
            Self::InvalidPageNumber { .. } => {
                "A highlight recorded a page that cannot exist, so it was left out \
                 rather than drawn on the wrong page. Nothing was deleted, and a backup \
                 is beside the file."
            }
            Self::InvalidTimestamp { .. } => {
                "A date recorded in this lecture could not be read, so it has been left \
                 out rather than shown wrongly. Nothing was deleted. If you edited a \
                 file by hand, a backup is beside it."
            }
            Self::InvalidOrderKey { .. } => {
                "One lecture's saved position could not be read, so it has been sorted \
                 to the end rather than hidden. Nothing was deleted. Use Renumber \
                 Folders to give it a fresh position."
            }
            Self::OrderKeysNotAscending { .. } | Self::OrderSpaceExhausted { .. } => {
                "This lecture could not be slotted into that position. Nothing was \
                 moved or lost. Use Renumber Folders to space the list out evenly, then \
                 try again."
            }
        }
    }
}
