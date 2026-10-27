//! Reading the current time.

use crate::domain::Timestamp;
use crate::error::CoreError;

/// A source of the current instant.
///
/// Declared as a port rather than calling `SystemTime::now()` inside the domain for two
/// reasons: the domain crate stays free of platform calls, and anything that stamps a
/// record can be tested against a known instant instead of against whenever the suite
/// happens to run.
pub trait Clock {
    /// The current instant, in UTC.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidTimestamp`] if the machine clock reads outside the
    /// years the stored format can represent. That is a broken clock rather than a
    /// broken caller, and failing is better than writing a malformed timestamp into
    /// someone's vault.
    fn now(&self) -> Result<Timestamp, CoreError>;
}

/// A clock stuck at one instant, for tests.
///
/// Lives beside the trait rather than in a test module so that adapter crates and
/// future integration tests can use it too, instead of each writing their own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FixedClock {
    instant: Timestamp,
}

impl FixedClock {
    /// A clock that always reports `instant`.
    #[must_use]
    pub fn new(instant: Timestamp) -> Self {
        Self { instant }
    }
}

impl Clock for FixedClock {
    fn now(&self) -> Result<Timestamp, CoreError> {
        Ok(self.instant.clone())
    }
}
