//! Finding a fraction strictly between two others.
//!
//! Fractions here are the digits *after* an order key's integer part, read as if
//! preceded by a radix point: `"V"` means 31/62, `"0V"` means 31/3844. They carry one
//! invariant — **no fraction ever ends in `'0'`** — because `"V"` and `"V0"` denote the
//! same value, and allowing both would make keys non-canonical and stop the recursion
//! below from terminating.
//!
//! Ported from David Greenspan's "Implementing Fractional Indexing", kept structurally
//! close to the reference so the two can be compared directly.

use super::base62::{self, BASE, ZERO};

/// A fraction strictly between `lower` and `upper`.
///
/// `lower` empty means zero; `upper` of `None` means one. Returns `None` only if an
/// invariant was already broken before the call — callers validate their inputs, so the
/// caller treats `None` as a defect rather than as ordinary input.
pub(super) fn between(lower: &str, upper: Option<&str>) -> Option<String> {
    if let Some(upper) = upper {
        // Any shared leading digits are carried straight through, and the search
        // continues in the narrower interval they describe. `lower` is conceptually
        // padded with '0' to whatever length is needed.
        let mut shared = 0usize;
        while let Some(&u) = upper.as_bytes().get(shared) {
            let l = lower.as_bytes().get(shared).copied().unwrap_or(ZERO);
            if l != u {
                break;
            }
            shared += 1;
        }

        if shared > 0 {
            let prefix = upper.get(..shared)?;
            let rest = between(lower.get(shared..).unwrap_or(""), Some(upper.get(shared..)?))?;
            return Some(format!("{prefix}{rest}"));
        }
    }

    let low_digit = match lower.as_bytes().first() {
        Some(&byte) => base62::value(byte)?,
        None => 0,
    };
    let high_digit = match upper {
        Some(upper) => base62::value(*upper.as_bytes().first()?)?,
        None => BASE,
    };

    // `checked_sub` rather than a bare subtraction: callers guarantee ascending input,
    // so an underflow here would mean a bug upstream, and it must surface as an error
    // rather than as a panic in someone's vault.
    if high_digit.checked_sub(low_digit)? > 1 {
        // Round half upward, matching the reference implementation exactly. Rounding
        // the other way would still be correct but would produce different keys, and
        // the two must not be mixed within one vault.
        let midpoint = (u16::from(low_digit) + u16::from(high_digit)).div_ceil(2);
        let digit = base62::digit(u8::try_from(midpoint).ok()?)?;
        return Some(char::from(digit).to_string());
    }

    // The bounds are adjacent digits, so there is no room at this position. Descend
    // into the next one.
    if let Some(upper) = upper
        && upper.len() > 1
    {
        // `upper` has more digits after its first, so truncating it to that first
        // digit alone lands strictly below it and above `lower`.
        return Some(upper.get(..1)?.to_string());
    }

    let head = base62::digit(low_digit)?;
    let rest = between(lower.get(1..).unwrap_or(""), None)?;
    Some(format!("{}{rest}", char::from(head)))
}
