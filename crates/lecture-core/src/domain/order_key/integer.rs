//! The integer part of an order key, and stepping it up or down.
//!
//! An order key is `<integer part><fraction>`. The integer part exists purely so that
//! **appending stays cheap forever**. Appending is by far the commonest operation — you
//! import lecture 1, then 2, then 3 — and with a purely fractional key each append
//! halves the remaining gap, so keys grow without bound: roughly one extra character
//! every six appends, which is hundreds of characters over a long course.
//!
//! With an integer part, an append usually just increments an integer, so keys stay
//! short no matter how many lectures are added in order. The fraction is only consulted
//! when something is inserted *between* two neighbours.
//!
//! The integer part's first byte (the "head") encodes both magnitude and sign:
//!
//! - `'a'..='z'` are non-negative, and the head says how many digits follow:
//!   `'a'` → 1 digit, `'b'` → 2, up to `'z'` → 26.
//! - `'A'..='Z'` are negative, counting the other way: `'Z'` → 1 digit, `'A'` → 26.
//!
//! Because `'A' < 'Z' < 'a' < 'z'` in ASCII, negatives sort before non-negatives and
//! longer magnitudes sort outermost, so byte order still matches numeric order.
//!
//! Ported from the algorithm described in David Greenspan's "Implementing Fractional
//! Indexing", which is the reference treatment; the structure is kept recognisably
//! close to it so the two can be compared line by line.

use super::base62::{self, BASE, MAX, ZERO};

/// The lowest representable integer part. Reserved as a sentinel and never a valid key.
pub(super) const SMALLEST: &str = "A00000000000000000000000000";

/// Total length in bytes of an integer part beginning with `head`.
///
/// `None` if `head` is not a letter, and therefore not a valid head.
pub(super) const fn len_for_head(head: u8) -> Option<usize> {
    match head {
        b'a'..=b'z' => Some((head - b'a') as usize + 2),
        b'A'..=b'Z' => Some((b'Z' - head) as usize + 2),
        _ => None,
    }
}

/// True if `text` is a complete, well-formed integer part.
pub(super) fn is_well_formed(text: &str) -> bool {
    let Some(&head) = text.as_bytes().first() else {
        return false;
    };
    let Some(expected) = len_for_head(head) else {
        return false;
    };
    let Some(digits) = text.get(1..) else {
        return false;
    };
    text.len() == expected && base62::all_digits(digits)
}

/// The next integer part above `x`, or `None` if `x` is already the largest.
pub(super) fn increment(x: &str) -> Option<String> {
    let (head, mut digits) = split(x)?;

    let mut carry = true;
    let mut i = digits.len();
    while carry && i > 0 {
        i -= 1;
        let slot = digits.get_mut(i)?;
        let next = base62::value(*slot)?.checked_add(1)?;
        if next == BASE {
            *slot = ZERO;
        } else {
            *slot = base62::digit(next)?;
            carry = false;
        }
    }

    if !carry {
        return assemble(head, &digits);
    }

    // Every digit wrapped, so the magnitude itself has to grow.
    match head {
        b'Z' => assemble(b'a', &[ZERO]),
        b'z' => None,
        _ => {
            let wider = head.checked_add(1)?;
            // Crossing into the non-negative run means one more digit; staying inside
            // the negative run means one fewer, because negative heads count the other
            // way. These two directions are why increment and decrement cannot share
            // this adjustment.
            if wider > b'a' {
                digits.push(ZERO);
            } else {
                digits.pop();
            }
            assemble(wider, &digits)
        }
    }
}

/// The next integer part below `x`, or `None` if `x` is already the smallest.
pub(super) fn decrement(x: &str) -> Option<String> {
    let (head, mut digits) = split(x)?;

    let mut borrow = true;
    let mut i = digits.len();
    while borrow && i > 0 {
        i -= 1;
        let slot = digits.get_mut(i)?;
        let current = base62::value(*slot)?;
        if current == 0 {
            *slot = MAX;
        } else {
            *slot = base62::digit(current - 1)?;
            borrow = false;
        }
    }

    if !borrow {
        return assemble(head, &digits);
    }

    match head {
        b'a' => assemble(b'Z', &[MAX]),
        b'A' => None,
        _ => {
            let narrower = head.checked_sub(1)?;
            if narrower < b'Z' {
                digits.push(MAX);
            } else {
                digits.pop();
            }
            assemble(narrower, &digits)
        }
    }
}

/// Splits an integer part into its head and an owned copy of its digits.
fn split(x: &str) -> Option<(u8, Vec<u8>)> {
    if !is_well_formed(x) {
        return None;
    }
    let head = *x.as_bytes().first()?;
    let digits = x.get(1..)?.as_bytes().to_vec();
    Some((head, digits))
}

/// Rebuilds a head plus digits into a string.
fn assemble(head: u8, digits: &[u8]) -> Option<String> {
    let mut bytes = Vec::with_capacity(digits.len() + 1);
    bytes.push(head);
    bytes.extend_from_slice(digits);
    String::from_utf8(bytes).ok()
}
