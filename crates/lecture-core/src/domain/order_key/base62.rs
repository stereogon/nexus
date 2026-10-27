//! Base-62 digits whose **ASCII order is their numeric order**.
//!
//! That coincidence is the whole trick behind order keys: because `'0' < '9' < 'A' <
//! 'Z' < 'a' < 'z'` in ASCII, and the digits are assigned values in exactly that
//! sequence, a plain byte-wise string comparison sorts keys into their logical order.
//! No parsing, no custom comparator, and `ORDER BY` in any future index works for free.
//!
//! Choosing a different alphabet, or reordering this one, silently breaks sorting
//! everywhere. There is a test asserting the two orders still agree.

/// The number of distinct digits.
pub(super) const BASE: u8 = 62;

/// The smallest digit, `'0'`.
pub(super) const ZERO: u8 = b'0';

/// The largest digit, `'z'`.
pub(super) const MAX: u8 = b'z';

/// The numeric value of an ASCII base-62 digit, or `None` if the byte is not one.
pub(super) const fn value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'A'..=b'Z' => Some(byte - b'A' + 10),
        b'a'..=b'z' => Some(byte - b'a' + 36),
        _ => None,
    }
}

/// The ASCII digit for a numeric value, or `None` if it is not below [`BASE`].
pub(super) const fn digit(value: u8) -> Option<u8> {
    match value {
        0..=9 => Some(b'0' + value),
        10..=35 => Some(b'A' + value - 10),
        36..=61 => Some(b'a' + value - 36),
        _ => None,
    }
}

/// True if every byte is a base-62 digit.
pub(super) fn all_digits(text: &str) -> bool {
    text.bytes().all(|b| value(b).is_some())
}
