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

use thiserror::Error;

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

    /// A path could not be used as a location inside the vault.
    #[error("`{path}` is not a usable location inside the vault: {reason}")]
    InvalidVaultPath {
        /// The rejected path.
        path: String,
        /// Which rule it broke.
        reason: &'static str,
    },

    /// A path sat deeper below the vault root than the depth cap allows.
    #[error("`{path}` is {depth} levels deep, past the limit of {max}")]
    VaultPathTooDeep {
        /// The rejected path.
        path: String,
        /// How deep it actually was.
        depth: usize,
        /// The cap it passed.
        max: usize,
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
            Self::InvalidName { .. } => "ERR_INVALID_NAME",
            Self::InvalidVaultPath { .. } => "ERR_INVALID_VAULT_PATH",
            Self::VaultPathTooDeep { .. } => "ERR_VAULT_PATH_TOO_DEEP",
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
            Self::InvalidName { .. } => {
                "That name cannot be used for a folder on disk. Nothing was created or \
                 renamed. Try a shorter name, or one without punctuation such as \
                 slashes or colons."
            }
            Self::InvalidVaultPath { .. } => {
                "That location cannot be used inside your vault. Nothing was created or \
                 moved. Choose a folder inside the vault and try again."
            }
            Self::VaultPathTooDeep { .. } => {
                "That folder sits more than five levels deep inside your vault, which is \
                 further than Nexus will follow. Nothing was moved. Drag it nearer the \
                 top of the vault, then try again."
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
