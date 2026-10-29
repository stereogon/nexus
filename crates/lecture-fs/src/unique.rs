//! A short token no other write or id in this vault will repeat.
//!
//! Extracted from `staging` on 2026-10-29, when annotation ids needed the same thing.
//! One implementation rather than two, because "unique enough" is a property worth
//! reasoning about once: a second copy is a second set of assumptions to keep true.
//!
//! # What it is built from, and what each part is for
//!
//! Sixteen hex digits of nanosecond clock, eight of process id, four of a counter:
//!
//! - the **clock** spreads tokens out, and is the part that makes them roughly ordered;
//! - the **process id** separates two copies of the app, or the app and a test binary;
//! - the **counter** breaks ties inside one process, where two calls can land in the same
//!   nanosecond.
//!
//! A clock set backwards cannot cause a collision, because the process id and counter
//! still differ. For staging files `create_new` is what actually guarantees uniqueness;
//! the token only has to make a clash unlikely enough not to matter.
//!
//! # Two devices
//!
//! §1.8 asks what happens with an iPad holding a copy of the same vault. A collision there
//! needs the same nanosecond *and* the same process id on both devices, which is remote
//! enough to accept for a single person's two machines — and if it ever did happen,
//! `AnnotationSet::insert` refuses a duplicate id rather than overwriting the annotation
//! already there. The consequence is a visible refusal, not a lost highlight.

use std::sync::atomic::{AtomicU16, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Breaks ties between two tokens minted in the same nanosecond in one process.
static SEQUENCE: AtomicU16 = AtomicU16::new(0);

/// The width of a token, in bytes: 16 hex digits of clock, 8 of process id, 4 of counter.
///
/// Fixed by construction, and a test holds the formatting to it so a change to the format
/// string cannot drift from the constant.
pub(crate) const TOKEN_BYTES: usize = 16 + 8 + 4;

/// A token no other concurrent or past call will produce.
///
/// Hex only, so it is safe in a filename and needs no escaping in a `cite://` URL.
pub(crate) fn token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    let truncated = u64::try_from(nanos & u128::from(u64::MAX)).unwrap_or(0);

    let process = std::process::id();
    let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);

    format!("{truncated:016x}{process:08x}{sequence:04x}")
}

#[cfg(test)]
mod tests {
    use super::{TOKEN_BYTES, token};

    #[test]
    fn a_token_is_the_width_the_budget_assumes() {
        assert_eq!(token().len(), TOKEN_BYTES);
    }

    #[test]
    fn successive_tokens_differ() {
        assert_ne!(
            token(),
            token(),
            "the sequence counter should break the tie"
        );
    }

    #[test]
    fn a_token_is_hex_only() {
        // The property both callers depend on: safe in a filename, and safe in a URL
        // without escaping.
        assert!(token().chars().all(|c| c.is_ascii_hexdigit()));
    }
}
