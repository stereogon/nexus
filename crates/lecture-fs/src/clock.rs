//! The real system clock.

use std::time::{SystemTime, UNIX_EPOCH};

use lecture_core::{Clock, CoreError, Timestamp};

/// Reads the machine's clock.
///
/// The only platform call here is `SystemTime::now()`. Turning seconds into a calendar
/// date is pure arithmetic and lives in `lecture-core`, so it is tested without a clock
/// and shared with the iPadOS adapter unchanged.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SystemClock;

impl SystemClock {
    /// A clock reading the machine's current time.
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Clock for SystemClock {
    fn now(&self) -> Result<Timestamp, CoreError> {
        // A clock set before 1970 yields a negative offset rather than an error: the
        // conversion handles negative seconds, and refusing to timestamp at all would
        // be a worse outcome than recording an obviously wrong date the user can see.
        let seconds = match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(elapsed) => i64::try_from(elapsed.as_secs()).unwrap_or(i64::MAX),
            Err(before_epoch) => {
                -i64::try_from(before_epoch.duration().as_secs()).unwrap_or(i64::MAX)
            }
        };

        Timestamp::from_unix_seconds(seconds)
    }
}
