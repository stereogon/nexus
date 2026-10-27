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
        }
    }
}
