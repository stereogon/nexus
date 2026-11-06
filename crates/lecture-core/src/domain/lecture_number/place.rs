//! Where a numbered lecture goes in the vault's order.
//!
//! `sequence` stays the one authority on order (`CLAUDE.md` §3); a number does not replace
//! it, it *places* it. A lecture given number `n` gets a key just before the first lecture,
//! in order, whose number is greater than `n` — so it lands after every lecture numbered
//! `n` or less, among those it belongs between, and only its own manifest changes.
//! Lectures without numbers keep their places and are stepped over.

use super::LectureNumber;
use crate::domain::OrderKey;
use crate::error::CoreError;

/// The order key for a lecture numbered `number`, among `others` — every other lecture's
/// key and number, in any order.
///
/// # Errors
///
/// Returns an [`OrderKey`] error only if the keys either side cannot be split, which
/// fractional keys make practically impossible.
pub fn placed_by_number(
    others: &[(OrderKey, Option<LectureNumber>)],
    number: &LectureNumber,
) -> Result<OrderKey, CoreError> {
    let mut ordered: Vec<&(OrderKey, Option<LectureNumber>)> = others.iter().collect();
    ordered.sort_by(|a, b| a.0.cmp(&b.0));

    let next = ordered
        .iter()
        .position(|(_, theirs)| theirs.as_ref().is_some_and(|theirs| theirs > number));

    match next {
        // Nothing numbered after it: at the end.
        None => OrderKey::between(ordered.last().map(|(key, _)| key), None),
        Some(at) => {
            let upper = ordered.get(at).map(|(key, _)| key);
            let lower = at
                .checked_sub(1)
                .and_then(|before| ordered.get(before))
                .map(|(key, _)| key);

            OrderKey::between(lower, upper)
        }
    }
}
