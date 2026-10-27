//! An instant, stored in one canonical form.
//!
//! Every timestamp in a bundle is written as `YYYY-MM-DDTHH:MM:SSZ` — RFC 3339, UTC,
//! whole seconds — and nothing else is accepted. That strictness is the feature, not
//! pedantry: with a single canonical form, **byte order equals chronological order**, so
//! sorting lectures by date needs no date library and no parsing. Allowing offsets or
//! fractional seconds would quietly break that, and the breakage would show up as a
//! mis-sorted list rather than as an error.
//!
//! Local time is never stored. A vault that syncs between a laptop and an iPad crossing
//! time zones would otherwise record instants that cannot be compared.

use std::fmt;
use std::ops::Range;

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// Seconds in a day. Unix time has no leap seconds, so this is exact.
const SECONDS_PER_DAY: i64 = 86_400;

/// The canonical form's length: `1970-01-01T00:00:00Z`.
const CANONICAL_LEN: usize = 20;

/// The widest year the four-digit format can represent.
const MAX_YEAR: i64 = 9999;

/// An instant in UTC, to the second.
///
/// Ordering is lexicographic on the canonical string, which is identical to
/// chronological ordering. A test holds that claim.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Timestamp(String);

impl TryFrom<String> for Timestamp {
    type Error = CoreError;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        Self::parse(&raw)
    }
}

impl From<Timestamp> for String {
    fn from(timestamp: Timestamp) -> Self {
        timestamp.0
    }
}

impl fmt::Display for Timestamp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl Timestamp {
    /// Parses a timestamp in the canonical form.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidTimestamp`] for anything that is not exactly
    /// `YYYY-MM-DDTHH:MM:SSZ`, including a valid RFC 3339 string in another shape such
    /// as `2026-10-27T16:00:00+01:00` or `2026-10-27T16:00:00.5Z`, and for a date that
    /// does not exist such as 30 February.
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        if raw.len() != CANONICAL_LEN {
            return Err(invalid(
                raw,
                "must be exactly `YYYY-MM-DDTHH:MM:SSZ` in UTC",
            ));
        }

        for (position, expected) in [(4, b'-'), (7, b'-'), (10, b'T'), (13, b':'), (16, b':')] {
            if raw.as_bytes().get(position) != Some(&expected) {
                return Err(invalid(
                    raw,
                    "separators must be `-`, `T` and `:` as in UTC",
                ));
            }
        }
        if raw.as_bytes().get(19) != Some(&b'Z') {
            return Err(invalid(raw, "must end in `Z`; only UTC is stored"));
        }

        let year = field(raw, 0..4, "year")?;
        let month = field(raw, 5..7, "month")?;
        let day = field(raw, 8..10, "day")?;
        let hour = field(raw, 11..13, "hour")?;
        let minute = field(raw, 14..16, "minute")?;
        let second = field(raw, 17..19, "second")?;

        if !(1..=12).contains(&month) {
            return Err(invalid(raw, "month must be between 01 and 12"));
        }
        if day < 1 || day > days_in_month(i64::from(year), month) {
            return Err(invalid(raw, "that day does not exist in that month"));
        }
        if hour > 23 {
            return Err(invalid(raw, "hour must be between 00 and 23"));
        }
        if minute > 59 {
            return Err(invalid(raw, "minute must be between 00 and 59"));
        }
        // 60 is rejected: Unix time has no leap seconds, so a stored `:60` could not
        // have come from this app and would not compare correctly against the rest.
        if second > 59 {
            return Err(invalid(raw, "second must be between 00 and 59"));
        }

        Ok(Self(raw.to_owned()))
    }

    /// Builds a timestamp from seconds since the Unix epoch.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidTimestamp`] if the instant falls outside year 0 to
    /// 9999, which the four-digit format cannot write. Reaching that means the machine
    /// clock is wrong, and erroring is better than writing a malformed timestamp into
    /// someone's vault.
    pub fn from_unix_seconds(seconds: i64) -> Result<Self, CoreError> {
        let days = seconds.div_euclid(SECONDS_PER_DAY);
        let within_day = seconds.rem_euclid(SECONDS_PER_DAY);

        let (year, month, day) = civil_from_days(days);
        if !(0..=MAX_YEAR).contains(&year) {
            return Err(CoreError::InvalidTimestamp {
                value: seconds.to_string(),
                reason: "falls outside the years this format can write",
            });
        }

        let hour = within_day / 3_600;
        let minute = (within_day % 3_600) / 60;
        let second = within_day % 60;

        Ok(Self(format!(
            "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z"
        )))
    }

    /// The canonical string, as written to disk.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Reads a fixed-width decimal field.
fn field(raw: &str, range: Range<usize>, name: &'static str) -> Result<u32, CoreError> {
    let text = raw
        .get(range)
        .ok_or_else(|| invalid(raw, "is not a complete timestamp"))?;

    // `str::parse` would accept a leading `+` or whitespace, neither of which belongs in
    // a fixed-width field, so digits are checked first.
    if !text.bytes().all(|b| b.is_ascii_digit()) {
        return Err(match name {
            "year" => invalid(raw, "year must be four digits"),
            "month" => invalid(raw, "month must be two digits"),
            "day" => invalid(raw, "day must be two digits"),
            "hour" => invalid(raw, "hour must be two digits"),
            "minute" => invalid(raw, "minute must be two digits"),
            _ => invalid(raw, "second must be two digits"),
        });
    }

    text.parse::<u32>()
        .map_err(|_| invalid(raw, "contains a number too large to be a date"))
}

/// Whether `year` has a 29th of February, by the Gregorian rule.
const fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

/// How many days `month` has in `year`.
const fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}

/// Converts days since 1970-01-01 into a civil year, month and day.
///
/// This is Howard Hinnant's `civil_from_days`, from his "chrono-Compatible Low-Level
/// Date Algorithms". It is exact integer arithmetic over the proleptic Gregorian
/// calendar, with no floating point and no table of month lengths, and it is used here
/// rather than a date crate because formatting the current instant is the only calendar
/// operation this app performs. The algorithm shifts the year to start in March, which
/// puts the leap day at the end of a year and removes every special case.
///
/// If parsing, arithmetic or time zones are ever needed, that is the point to adopt a
/// real date library instead of extending this.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    // Re-base onto 0000-03-01, the start of a 400-year era.
    let shifted = days + 719_468;

    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = shifted - era * 146_097;

    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;

    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_position = (5 * day_of_year + 2) / 153;

    let day = day_of_year - (153 * month_position + 2) / 5 + 1;
    let month = if month_position < 10 {
        month_position + 3
    } else {
        month_position - 9
    };

    // March-based year: January and February belong to the following civil year.
    let civil_year = if month <= 2 { year + 1 } else { year };

    (
        civil_year,
        u32::try_from(month).unwrap_or(0),
        u32::try_from(day).unwrap_or(0),
    )
}

fn invalid(raw: &str, reason: &'static str) -> CoreError {
    CoreError::InvalidTimestamp {
        value: raw.to_owned(),
        reason,
    }
}
