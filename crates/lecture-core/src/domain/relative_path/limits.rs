//! How deep things may nest, and why there are two numbers rather than one.
//!
//! Split out of the path type because these are a different concern — "what is a path"
//! versus "how deep may things go" — and because the reasoning below is longer than the
//! code it governs.

/// How deep a *lecture directory* may sit inside the vault.
///
/// This is the cap the spec sets on organisational nesting — `year/course/module/week/
/// lecture` and no deeper. Enforced in the domain rather than at the UI because a path
/// can also arrive from a hand-edited manifest, where an unbounded depth turns a vault
/// walk into an unbounded recursion.
pub const MAX_BUNDLE_DEPTH: usize = 5;

/// How much of [`MAX_DEPTH`] is reserved for the path *inside* a bundle.
///
/// Real ones are two segments (`source/document.pdf`, `assets/figure.png`); three leaves
/// room for a subfolder of assets without inviting a filing system inside a lecture.
///
/// This is headroom in the total, **not** a separately enforced cap on an in-bundle
/// path. Nothing checks a manifest's `source.document` against it, because containment
/// does not depend on depth: an in-bundle path is a sequence of `Slug`s and so cannot
/// walk upward however long it is. The number exists to make [`MAX_DEPTH`] a stated sum
/// rather than a figure someone has to reverse-engineer.
pub const MAX_WITHIN_BUNDLE_DEPTH: usize = 3;

/// The deepest a vault-relative path may go, in segments.
///
/// It must be the *sum* of the two caps above, not either one alone. Conflating them was
/// a real bug: with this set to 5, a bundle sitting at the five levels the spec allows
/// could not address its own `manifest.json`, because that path is six segments — so a
/// legitimate vault layout produced a lecture the app could not open at all. The
/// assertion below is what stops the two drifting apart again.
pub const MAX_DEPTH: usize = MAX_BUNDLE_DEPTH + MAX_WITHIN_BUNDLE_DEPTH;

const _: () = assert!(MAX_DEPTH == MAX_BUNDLE_DEPTH + MAX_WITHIN_BUNDLE_DEPTH);

// The invariant that makes the original bug unrepresentable rather than merely fixed:
// with no headroom, a bundle at the deepest allowed level could not name a single file
// inside itself, and the app could not open it.
const _: () = assert!(
    MAX_WITHIN_BUNDLE_DEPTH > 0,
    "a bundle must have room to address its own files"
);
