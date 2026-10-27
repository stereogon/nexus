//! A lecture's position among its siblings, as a sortable string.
//!
//! Order keys are the reason reordering a course is cheap. A plain integer `order`
//! field would mean that inserting a lecture at position 2 of 10 rewrites eight
//! manifests — eight files to write atomically, and eight files for a sync client to
//! reconcile, every time someone drags one item. An order key instead names a point
//! *between* its two neighbours, so **one** manifest is written and the neighbours are
//! not touched at all.
//!
//! That property is what makes the folder-prefix projection safe: see `CLAUDE.md` §3,
//! where `sequence` is authoritative and `01-` prefixes are derived from it.
//!
//! Keys compare bytewise, so `Ord` here is just string order, and sorting a vault needs
//! no knowledge of this module.

mod base62;
mod integer;
mod midpoint;

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// The key given to the first item in an empty list.
const FIRST: &str = "a0";

/// A validated position key. Sorts bytewise into logical order.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String")]
pub struct OrderKey(String);

impl TryFrom<String> for OrderKey {
    type Error = CoreError;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        Self::parse(&raw)
    }
}

impl OrderKey {
    /// Validates `raw` as an order key.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidOrderKey`] if `raw` is empty, does not begin with a
    /// valid head letter, has a truncated or malformed integer part, contains a byte
    /// that is not a base-62 digit, ends its fraction in `'0'` (which would make the
    /// key non-canonical, since a trailing zero does not change the value), or is the
    /// reserved smallest-integer sentinel.
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        let invalid = |reason: &'static str| CoreError::InvalidOrderKey {
            key: raw.to_owned(),
            reason,
        };

        if raw == integer::SMALLEST {
            return Err(invalid("this value is reserved as a lower sentinel"));
        }

        let integer_part = Self::integer_part(raw)?;
        if !integer::is_well_formed(integer_part) {
            return Err(invalid("integer part is malformed"));
        }

        let fraction = raw.get(integer_part.len()..).unwrap_or("");
        if !base62::all_digits(fraction) {
            return Err(invalid("contains a character that is not a base-62 digit"));
        }
        if fraction.as_bytes().last() == Some(&base62::ZERO) {
            return Err(invalid("fraction ends in '0', so the key is not canonical"));
        }

        Ok(Self(raw.to_owned()))
    }

    /// The key for the first item in a previously empty list.
    #[must_use]
    pub fn first() -> Self {
        Self(FIRST.to_owned())
    }

    /// A key that sorts strictly between `lower` and `upper`.
    ///
    /// `None` for `lower` means "before everything"; `None` for `upper` means "after
    /// everything". Both `None` yields the same key as [`OrderKey::first`]. Neither
    /// neighbour is modified, so the caller writes exactly one manifest.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::OrderKeysNotAscending`] if `lower` is not strictly before
    /// `upper`, and [`CoreError::OrderSpaceExhausted`] if the range ran out at one end.
    pub fn between(lower: Option<&Self>, upper: Option<&Self>) -> Result<Self, CoreError> {
        if let (Some(low), Some(high)) = (lower, upper)
            && low.0 >= high.0
        {
            return Err(CoreError::OrderKeysNotAscending {
                lower: low.0.clone(),
                upper: high.0.clone(),
            });
        }

        let generated = match (lower, upper) {
            (None, None) => FIRST.to_owned(),
            (None, Some(high)) => Self::before(&high.0)?,
            (Some(low), None) => Self::after(&low.0)?,
            (Some(low), Some(high)) => Self::strictly_between(&low.0, &high.0)?,
        };

        // Re-validating what we just generated is deliberate. It costs one cheap pass
        // and converts any future defect in this module into a refused insert rather
        // than a malformed key written into somebody's vault, where it would then be
        // synced to their other devices.
        Self::parse(&generated)
    }

    /// The key as stored on disk.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// A key immediately below `high`.
    fn before(high: &str) -> Result<String, CoreError> {
        let integer_part = Self::integer_part(high)?;
        let fraction = high.get(integer_part.len()..).unwrap_or("");

        if integer_part == integer::SMALLEST {
            // Already at the lowest integer, so the room has to come from the fraction.
            let mid = midpoint::between("", Some(fraction))
                .ok_or_else(|| Self::defect(high, "no fraction below the lower sentinel"))?;
            return Ok(format!("{integer_part}{mid}"));
        }

        if integer_part.len() < high.len() {
            // `high` carries a fraction, so its integer part alone already sits below it.
            return Ok(integer_part.to_owned());
        }

        integer::decrement(integer_part).ok_or_else(|| CoreError::OrderSpaceExhausted {
            bound: high.to_owned(),
        })
    }

    /// A key immediately above `low`.
    fn after(low: &str) -> Result<String, CoreError> {
        let integer_part = Self::integer_part(low)?;
        let fraction = low.get(integer_part.len()..).unwrap_or("");

        if let Some(next) = integer::increment(integer_part) {
            return Ok(next);
        }

        // The integer part is already at its ceiling, so the room has to come from the
        // fraction instead.
        let mid = midpoint::between(fraction, None)
            .ok_or_else(|| Self::defect(low, "no fraction above the final key"))?;
        Ok(format!("{integer_part}{mid}"))
    }

    /// A key between two existing keys.
    fn strictly_between(low: &str, high: &str) -> Result<String, CoreError> {
        let low_integer = Self::integer_part(low)?;
        let low_fraction = low.get(low_integer.len()..).unwrap_or("");
        let high_integer = Self::integer_part(high)?;

        if low_integer == high_integer {
            let high_fraction = high.get(high_integer.len()..).unwrap_or("");
            let mid = midpoint::between(low_fraction, Some(high_fraction))
                .ok_or_else(|| Self::defect(low, "no fraction between the two keys"))?;
            return Ok(format!("{low_integer}{mid}"));
        }

        let stepped =
            integer::increment(low_integer).ok_or_else(|| CoreError::OrderSpaceExhausted {
                bound: low.to_owned(),
            })?;
        if stepped.as_str() < high {
            return Ok(stepped);
        }

        let mid = midpoint::between(low_fraction, None)
            .ok_or_else(|| Self::defect(low, "no fraction above the lower key"))?;
        Ok(format!("{low_integer}{mid}"))
    }

    /// The leading integer part of a key.
    fn integer_part(key: &str) -> Result<&str, CoreError> {
        let head = key
            .as_bytes()
            .first()
            .copied()
            .ok_or_else(|| CoreError::InvalidOrderKey {
                key: key.to_owned(),
                reason: "an order key cannot be empty",
            })?;

        let length = integer::len_for_head(head).ok_or_else(|| CoreError::InvalidOrderKey {
            key: key.to_owned(),
            reason: "must begin with a letter",
        })?;

        key.get(..length).ok_or_else(|| CoreError::InvalidOrderKey {
            key: key.to_owned(),
            reason: "integer part is truncated",
        })
    }

    /// An error for a condition that should be unreachable given validated input.
    fn defect(key: &str, reason: &'static str) -> CoreError {
        CoreError::InvalidOrderKey {
            key: key.to_owned(),
            reason,
        }
    }
}
