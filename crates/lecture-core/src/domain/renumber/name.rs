//! Reading and building the `NN-` prefix that projects `sequence` onto a folder name.

use crate::domain::Slug;
use crate::error::CoreError;

/// Marks a folder that is part-way through a renumber.
///
/// Appended to the folder's **existing** name rather than its target, so that a leftover
/// from an interrupted renumber says where it came from. Stripping the suffix recovers a
/// name whose prefix then parses normally, which is what makes a crashed renumber
/// resumable instead of needing a journal.
pub const RENUMBERING_SUFFIX: &str = "~renumbering";

/// The part of a folder name that is not its position.
///
/// Strips a renumbering suffix first, then a leading `NN-`, so the stem of
/// `03-raft~renumbering` is `raft`. A name with no prefix is its own stem, which is why
/// renumbering a vault that has never been numbered just adds prefixes.
#[must_use]
pub fn stem_of(name: &str) -> &str {
    let name = name.strip_suffix(RENUMBERING_SUFFIX).unwrap_or(name);

    match name.split_once('-') {
        // Digits only, and at least one: `1-x` and `007-x` both count, `v2-x` does not.
        Some((head, rest)) if !head.is_empty() && head.bytes().all(|b| b.is_ascii_digit()) => rest,
        _ => name,
    }
}

/// How many digits to pad positions to.
///
/// Wide enough for the largest position, and never fewer than two. The width has to come
/// from the count rather than being fixed, because `NN-` prefixes are read by sorting
/// them as text: with a fixed two digits, a hundredth lecture would be named `100-` and
/// sort *before* `99-`, which is precisely the Finder legibility the prefixes exist for.
///
/// The cost is that adding a hundredth lecture renumbers the other ninety-nine. Rare, and
/// the alternative is a vault that sorts wrongly for good.
#[must_use]
pub fn position_width(count: usize) -> usize {
    count.to_string().len().max(2)
}

/// The name a folder should have at `position` of `count`.
///
/// # Errors
///
/// Returns [`CoreError::InvalidName`] if the stem makes a name too long to use, which is
/// reported rather than truncated — silently shortening someone's folder name would be a
/// surprising thing for a tidying operation to do.
pub fn positioned_name(position: usize, count: usize, stem: &str) -> Result<Slug, CoreError> {
    let width = position_width(count);

    Slug::parse(&format!("{position:0width$}-{stem}"))
}

/// A temporary name for `current`, free of everything in `taken`.
///
/// # Errors
///
/// Returns [`CoreError::InvalidName`] if no usable temporary name exists, which happens
/// only for a name already close to the length limit. Such a folder is reported as
/// blocked rather than renamed to something lossy.
pub fn temporary_name(current: &Slug, taken: &dyn Fn(&str) -> bool) -> Result<Slug, CoreError> {
    let base = format!("{}{RENUMBERING_SUFFIX}", current.as_str());

    // The plain suffix first. A collision on it means a previous renumber was interrupted
    // and left that name behind, so counting past it is correct: both folders are real
    // and both need a name.
    let candidates =
        std::iter::once(base.clone()).chain((2..100u32).map(|n| format!("{base}-{n}")));

    for candidate in candidates {
        if taken(&candidate) {
            continue;
        }

        if let Ok(name) = Slug::parse(&candidate) {
            return Ok(name);
        }
    }

    Err(CoreError::InvalidName {
        name: base,
        reason: "no temporary name is available for it during a renumber",
    })
}
